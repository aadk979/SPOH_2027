import {
  ERROR_CODES,
  type ActiveLostPersonResponse,
  type LostPersonAlertRecord,
  type RaiseLostPersonRequest,
  type ResolveLostPersonRequest,
} from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../platform/audit/index.js';
import { AppError, NotFoundError } from '../../platform/errors/index.js';
import { logger } from '../../platform/logger/index.js';
import { prisma } from '../../platform/db/client.js';
import { minutesBetween } from '../../platform/time/index.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../platform/http/auditContext.js';
import { findStationById } from '../station/data/repo.js';
import { DEFAULT_SETTINGS, getSettings } from '../../platform/settings/index.js';
import { dispatch } from '../notification/service.js';
import {
  acknowledgeAlert,
  acknowledgedAlertIds,
  createAlert,
  findAlertById,
  findPurgeCandidates,
  listActiveAlerts,
  purgeAlert,
  resolveAlert,
  toAlertRecord,
  type AlertWithContext,
} from './repo.js';

/**
 * Lost person (PRODUCT_BRIEF §7.3) — the highest-value single feature here, and
 * the only place the system holds a description of a human being.
 *
 * Two constraints shape everything below:
 *
 *  1. The record is TRANSIENT. It exists to coordinate a search. Once resolved
 *     and past the retention window it is reduced to an anonymised summary, and
 *     every report reads the summary. What goes in the post-event report is
 *     "3 cases, all resolved, median 7 minutes", never a description of a child.
 *
 *  2. Calling still beats tapping. This coordinates the search; it is not the
 *     emergency channel. The reporter's phone number rides with the alert for
 *     exactly that reason.
 */

/**
 * How long a resolved alert keeps its descriptive fields (BUILD_PLAN §5.9).
 *
 * The shipped default; the live value is a runtime setting. Shortening it is
 * the safer direction and the one somebody may want on the day — the only cost
 * is that a report run the morning after has to lean on the unpurged count.
 */
export const PURGE_AFTER_HOURS = DEFAULT_SETTINGS.lostPersonPurgeHours;

/** The idempotency endpoint name of `POST /lost-person`. */
export const RAISE_ENDPOINT = 'POST /lost-person';

export async function raiseAlert(
  request: RaiseLostPersonRequest,
  raisedById: string,
  audit: AuditContext,
): Promise<LostPersonAlertRecord> {
  const alert = await prisma.$transaction(async (tx) => {
    const row = await createAlert(tx, {
      approxAge: request.approxAge ?? null,
      descriptionText: request.descriptionText,
      clothingText: request.clothingText ?? null,
      lastSeenStationId: request.lastSeenStationId ?? null,
      lastSeenAt: request.lastSeenAt ? new Date(request.lastSeenAt) : null,
      raisedById,
      raisedAt: new Date(),
    });

    await writeAudit(tx, {
      ...audit,
      action: 'lostPerson.raise',
      entityType: 'LostPersonAlert',
      entityId: row.id,
      // No description in the audit payload. The alert's own fields are purged
      // on resolution; copying them into an audit row that is never purged
      // would quietly defeat the whole transience guarantee.
      after: { lastSeenStationId: row.lastSeenStationId },
    });

    return row;
  });

  broadcast(alert);

  return decorate(alert, raisedById);
}

/** One alert as the viewer sees it now: after a purge, without its description. */
export async function getAlert(alertId: string, viewerId: string): Promise<LostPersonAlertRecord> {
  const alert = await findAlertById(alertId);
  if (!alert) throw new NotFoundError('Lost person alert');
  return decorate(alert, viewerId);
}

/**
 * The client polls this every 10 seconds. Push is best effort; the poll is the
 * contract (BUILD_PLAN §7.3).
 */
export async function getActiveAlerts(viewerId: string): Promise<ActiveLostPersonResponse> {
  const alerts = await listActiveAlerts();
  const acked = await acknowledgedAlertIds(
    viewerId,
    alerts.map((alert) => alert.id),
  );

  const records = await Promise.all(
    alerts.map(async (alert) => {
      const station = alert.lastSeenStationId
        ? await findStationById(alert.lastSeenStationId)
        : null;
      return toAlertRecord(alert, {
        stationName: station?.name ?? null,
        ackedByMe: acked.has(alert.id),
      });
    }),
  );

  return { asOf: new Date().toISOString(), alerts: records };
}

/**
 * Acknowledge. This is what lets the Safety IC see live how much of the floor
 * an alert has actually reached, rather than assuming a broadcast was read.
 */
export async function acknowledge(
  alertId: string,
  volunteerId: string,
): Promise<LostPersonAlertRecord> {
  const alert = await findAlertById(alertId);
  if (!alert) throw new NotFoundError('Lost person alert');

  await acknowledgeAlert(alertId, volunteerId);

  const refreshed = await findAlertById(alertId);
  if (!refreshed) throw new NotFoundError('Lost person alert');

  return decorate(refreshed, volunteerId);
}

/** Resolving clears the alert on every device. */
export async function resolve(
  alertId: string,
  request: ResolveLostPersonRequest,
  audit: AuditContext,
): Promise<LostPersonAlertRecord> {
  const existing = await findAlertById(alertId);
  if (!existing) throw new NotFoundError('Lost person alert');

  if (existing.status !== 'ACTIVE') {
    throw new AppError(
      409,
      ERROR_CODES.ALERT_ALREADY_RESOLVED,
      'This alert has already been resolved',
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await resolveAlert(tx, alertId, request.outcome, now);

    await writeAudit(tx, {
      ...audit,
      action: 'lostPerson.resolve',
      entityType: 'LostPersonAlert',
      entityId: alertId,
      before: { status: existing.status },
      after: {
        status: request.outcome,
        resolutionMinutes: minutesBetween(existing.raisedAt, now),
      },
    });
  });

  const refreshed = await findAlertById(alertId);
  if (!refreshed) throw new NotFoundError('Lost person alert');

  broadcastResolved(alertId);

  return decorate(refreshed, audit.actorId ?? '');
}

/**
 * The purge job (BUILD_PLAN §5.9). Runs every 15 minutes and on demand.
 *
 * Creates the anonymised summary and nulls the descriptive fields in one
 * transaction per alert, so an alert can never end up both un-summarised and
 * stripped of the information the summary is derived from.
 */
export async function purgeResolvedAlerts(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - getSettings().lostPersonPurgeHours * 60 * 60 * 1000);
  const candidates = await findPurgeCandidates(cutoff);

  let purged = 0;

  for (const alert of candidates) {
    // Defensive: `findPurgeCandidates` already filters on these, but the purge
    // is the one operation that destroys data and it should not rely on a
    // query filter alone.
    if (alert.status === 'ACTIVE' || !alert.resolvedAt) continue;
    const outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER' = alert.status;
    const resolvedAt = alert.resolvedAt;

    await prisma.$transaction(async (tx) => {
      await purgeAlert(tx, {
        id: alert.id,
        raisedAt: alert.raisedAt,
        resolvedAt,
        outcome,
        ackCount: alert._count.acknowledgements,
        resolutionMinutes: minutesBetween(alert.raisedAt, resolvedAt),
      });

      // A create response stored before replays were redacted still holds the
      // description (F04-013). Reduce it to the id the redacted replay reads.
      await tx.idempotencyRecord.updateMany({
        where: {
          endpoint: RAISE_ENDPOINT,
          responseBody: { path: ['alert', 'id'], equals: alert.id },
        },
        data: { responseBody: { alertId: alert.id } },
      });

      await writeAudit(tx, {
        ...SYSTEM_AUDIT_CONTEXT,
        action: 'lostPerson.purge',
        entityType: 'LostPersonAlert',
        entityId: alert.id,
        after: { purged: true },
      });
    });

    purged += 1;
  }

  if (purged > 0) logger.info({ purged }, 'purged resolved lost-person alerts');

  return purged;
}

async function decorate(alert: AlertWithContext, viewerId: string): Promise<LostPersonAlertRecord> {
  const station = alert.lastSeenStationId ? await findStationById(alert.lastSeenStationId) : null;
  const acked = await acknowledgedAlertIds(viewerId, [alert.id]);

  return toAlertRecord(alert, {
    stationName: station?.name ?? null,
    ackedByMe: acked.has(alert.id),
  });
}

/**
 * Fan out to every device.
 *
 * The 10-second poll of `/lost-person/active` remains the delivery guarantee;
 * this reaches the phones that are in a pocket with the app closed, which the
 * poll cannot.
 *
 * Note what the payload does NOT contain: the description, the clothing, the
 * approximate age. Those are the fields the purge exists to destroy after 24
 * hours, and a push notification is copied into the operating system's own
 * notification history, where nothing we do afterwards can reach it. The
 * notification says a child is missing; the app says who.
 */
function broadcast(alert: { id: string }): void {
  void dispatch({
    kind: 'lostPerson.raised',
    priority: 'URGENT',
    title: 'Lost person — check your app now',
    body: 'A lost person alert is active. Open SPOH Ops for the description.',
    url: '/home',
    tag: `lost-person:${alert.id}`,
    audience: { everyone: true, volunteerIds: [] },
  });
}

/**
 * Tell the floor to stand down.
 *
 * As important as raising it. Volunteers still searching for a child who has
 * been found are volunteers not doing their actual job, and the next real alert
 * lands on people who learned that the last one never ended.
 */
function broadcastResolved(alertId: string): void {
  void dispatch({
    kind: 'lostPerson.resolved',
    priority: 'OPERATIONAL',
    title: 'Lost person resolved',
    body: 'The alert has been closed. Thank you — stand down.',
    url: '/home',
    // Same tag as the raise, so it replaces that notification rather than
    // stacking underneath it.
    tag: `lost-person:${alertId}`,
    audience: { everyone: true, volunteerIds: [] },
  });
}
