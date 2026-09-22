import { Router, type Request, type Response } from 'express';
import {
  AuditFacets,
  AuditQuery,
  type AuditLogPage,
  type AuditLogRecord,
  type AuditSinkStatus,
} from '@spoh/shared';
import { requireAuth } from '../../middleware/auth/index.js';
import { defaultRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import { validate, validatedQuery } from '../../middleware/validate.js';
import { env } from '../../config/env.js';
import { cloudWatchStatus } from '../../lib/cloudwatch.js';
import { prisma } from '../../lib/prisma.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from './actions.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * The audit log (BUILD_PLAN §7.2, §8.7).
 *
 * Read-only, Chief and Lead and Admin only. Every void, adjustment, reissue,
 * status change, roster edit, fallback declaration, import, station-scope
 * bypass and provisioning lands here — written inside the same transaction as
 * the change it describes, so the log is complete rather than merely usually
 * complete — alongside every refused request, which has no transaction to join
 * and is written on its own.
 *
 * ── Why there is no unpaginated read ────────────────────────────────────────
 *
 * This is the largest table in the system and it grows fastest on the day
 * somebody most wants to read it. Both directions of travel are bounded by
 * `limit` (200 hard ceiling, 50 default) and neither accepts an offset, so
 * there is no shape of request that returns the whole table. The screen pages
 * backwards with `cursor` and tails forwards with `sinceId`; a caller that
 * wants everything has to ask 200 at a time and can be seen doing it.
 */
export const auditRouter: Router = Router();

auditRouter.use(requireAuth);

type Query = ReturnType<typeof validatedQuery<AuditQuery>>;

type AuditRow = Prisma.AuditLogGetPayload<{
  include: { actor: { select: { displayName: true } } };
}>;

/**
 * Severity is ordered, so filtering on it means "at this level and above".
 *
 * The screen says "Warning and above", and an exact match would quietly hide
 * the CRITICAL rows — the ones the filter was reached for.
 */
const SEVERITY_LADDER = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'] as const;

function severityAtLeast(floor: (typeof SEVERITY_LADDER)[number]) {
  return SEVERITY_LADDER.slice(SEVERITY_LADDER.indexOf(floor));
}

/** Build the `where` once; both the page query and the tail query use it. */
function filtersFrom(query: Query): Prisma.AuditLogWhereInput {
  const prefixes = query.actionPrefix
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    ...(query.action ? { action: query.action } : {}),
    ...(prefixes?.length
      ? { OR: prefixes.map((prefix) => ({ action: { startsWith: prefix } })) }
      : {}),
    ...(query.severity ? { severity: { in: [...severityAtLeast(query.severity)] } } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.q
      ? {
          // Deliberately narrow. A LIKE across the JSON payload columns is a
          // sequential scan of the biggest table we have, and on a phone-shaped
          // screen nobody is reading `before`/`after` to find a row anyway.
          OR: [
            { action: { contains: query.q, mode: 'insensitive' as const } },
            { entityType: { contains: query.q, mode: 'insensitive' as const } },
            { entityId: query.q },
            { requestId: query.q },
            { path: { contains: query.q, mode: 'insensitive' as const } },
            { actor: { displayName: { contains: query.q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lt: new Date(query.to) } : {}),
          },
        }
      : {}),
  };
}

function toRecord(entry: AuditRow): AuditLogRecord {
  return {
    id: entry.id,
    action: entry.action,
    severity: entry.severity,
    outcome: entry.outcome,
    entityType: entry.entityType,
    entityId: entry.entityId,
    actorId: entry.actorId,
    actorName: entry.actor?.displayName ?? 'System',
    actorSub: entry.actorSub,
    method: entry.method,
    path: entry.path,
    statusCode: entry.statusCode,
    ip: entry.ip,
    userAgent: entry.userAgent,
    requestId: entry.requestId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    createdAt: entry.createdAt.toISOString(),
  };
}

auditRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('audit.read'),
  validate({ query: AuditQuery }),
  async (req: Request, res: Response) => {
    const query = validatedQuery<AuditQuery>(req);
    const where = filtersFrom(query);

    // ── Tail mode ────────────────────────────────────────────────────────────
    //
    // "What has happened since the row I already have." Ascending, so the
    // client appends rather than reconciles, and bounded by the same limit as
    // a page — a client that has been closed for an hour gets the oldest
    // `limit` rows it is missing and asks again, rather than one enormous
    // response.
    if (query.sinceId) {
      const anchor = await prisma.auditLog.findUnique({
        where: { id: query.sinceId },
        select: { createdAt: true },
      });

      // An anchor we cannot find means the client is holding an id from a
      // previous deployment or a purged row. Sending nothing would strand it
      // forever, so fall through to a normal newest-first page instead.
      if (anchor) {
        const rows = await prisma.auditLog.findMany({
          where: {
            AND: [
              where,
              {
                OR: [
                  { createdAt: { gt: anchor.createdAt } },
                  // Same millisecond, later id. Two rows written inside one
                  // transaction share a timestamp, and without this tiebreak
                  // the second one is never delivered.
                  { createdAt: anchor.createdAt, id: { gt: query.sinceId } },
                ],
              },
            ],
          },
          include: { actor: { select: { displayName: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: query.limit,
        });

        const page: AuditLogPage = {
          data: rows.map(toRecord),
          meta: {
            count: rows.length,
            nextCursor: null,
            // A full page means more is waiting; poll again immediately rather
            // than after the usual interval.
            hasMore: rows.length === query.limit,
            latestId: rows.at(-1)?.id ?? query.sinceId,
          },
        };

        res.status(200).json(page);
        return;
      }
    }

    // ── Page mode ────────────────────────────────────────────────────────────
    //
    // One row over the limit, so `hasMore` is known without a count. The extra
    // row is dropped before it is serialised.
    const rows = await prisma.auditLog.findMany({
      where,
      include: { actor: { select: { displayName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;

    const page: AuditLogPage = {
      data: data.map(toRecord),
      meta: {
        count: data.length,
        // Null when there is nothing after this page. The previous version
        // always returned the last id, so a client that paged to the end kept
        // asking for a page that was always empty.
        nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
        hasMore,
        latestId: data[0]?.id ?? null,
      },
    };

    res.status(200).json(page);
  },
);

/**
 * Filter options.
 *
 * Served from the static action list rather than a `SELECT DISTINCT action`,
 * which on this table is a scan — and which would also hide an action that is
 * defined but has not happened yet, exactly when an admin is looking for it.
 */
auditRouter.get(
  '/facets',
  defaultRateLimit,
  requireCapability('audit.read'),
  (_req: Request, res: Response) => {
    const facets: AuditFacets = {
      actions: [...AUDIT_ACTIONS],
      entityTypes: [...AUDIT_ENTITY_TYPES],
      severities: ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'],
      outcomes: ['SUCCESS', 'DENIED', 'FAILURE'],
    };

    res.status(200).json(AuditFacets.parse(facets));
  },
);

/**
 * Where the trail is being shipped.
 *
 * The screen shows this as a banner, because "the audit log is also in
 * CloudWatch" is only reassuring if it is true right now — a delivery that has
 * been failing since Tuesday should say so on the page somebody is reading,
 * not only in the log it is failing to deliver.
 */
auditRouter.get(
  '/sink',
  defaultRateLimit,
  requireCapability('audit.read'),
  (_req: Request, res: Response) => {
    const cw = cloudWatchStatus();

    const status: AuditSinkStatus = {
      cloudWatch: {
        enabled: cw.enabled,
        logGroup: cw.logGroup,
        auditLogGroup: cw.auditLogGroup,
        region: cw.region,
        delivered: cw.delivered,
        dropped: cw.dropped,
        lastError: cw.lastError,
        lastDeliveryAt: cw.lastDeliveryAt?.toISOString() ?? null,
      },
      retentionDays: env.CLOUDWATCH_RETENTION_DAYS ?? null,
    };

    res.status(200).json(status);
  },
);
