import { prisma, type PrismaTransactionClient } from '../db/client.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { logger } from '../logger/index.js';
import type { SettingKey, SettingScope } from './registry.js';
import { resolveSetting, type ResolvedSetting, type SettingLayer } from './resolve.js';

export type SettingTarget =
  | { scope: 'platform'; organisationId: string }
  | { scope: 'event'; eventId: string }
  | { scope: 'station'; eventId: string; stationId: string };

export interface SettingContext {
  organisationId: string;
  eventId?: string;
  stationId?: string;
}

export function scopeOf(target: SettingTarget): {
  scope: 'PLATFORM' | 'EVENT' | 'STATION';
  scopeId: string;
  eventId: string | null;
} {
  if (target.scope === 'platform') {
    return { scope: 'PLATFORM', scopeId: target.organisationId, eventId: null };
  }
  if (target.scope === 'event') {
    return { scope: 'EVENT', scopeId: target.eventId, eventId: target.eventId };
  }
  return { scope: 'STATION', scopeId: target.stationId, eventId: target.eventId };
}

/** A target must exist and a station must belong to the named event. */
export async function assertSettingTarget(
  tx: PrismaTransactionClient,
  target: SettingTarget,
): Promise<void> {
  if (target.scope === 'platform') {
    const organisation = await tx.organisation.findUnique({
      where: { id: target.organisationId },
      select: { id: true },
    });
    if (!organisation) throw new NotFoundError('Organisation');
    return;
  }
  if (target.scope === 'event') {
    const event = await tx.event.findUnique({
      where: { id: target.eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundError('Event');
    return;
  }
  const station = await tx.station.findFirst({
    where: { eventId: target.eventId, id: target.stationId },
    select: { id: true },
  });
  if (!station) throw new NotFoundError('Station');
}

/** Every event-owned read states its event; a platform row states its organisation. */
export async function storedSetting(
  target: SettingTarget,
  key: SettingKey,
  db: PrismaTransactionClient = prisma,
): Promise<{ value: unknown; version: number } | null> {
  const { scope, scopeId, eventId } = scopeOf(target);
  return db.setting.findFirst({
    where: { scope, scopeId, eventId, key },
    select: { value: true, version: true },
  });
}

async function assertContext(db: PrismaTransactionClient, context: SettingContext): Promise<void> {
  if (context.stationId && !context.eventId) {
    throw new ValidationError('Station settings require an event');
  }
  if (context.eventId) {
    const event = await db.event.findFirst({
      where: { id: context.eventId, organisationId: context.organisationId },
      select: { id: true },
    });
    if (!event) throw new NotFoundError('Event');
  }
  if (context.stationId && context.eventId) {
    const station = await db.station.findFirst({
      where: { id: context.stationId, eventId: context.eventId },
      select: { id: true },
    });
    if (!station) throw new NotFoundError('Station');
  }
}

/** Load each allowed layer separately, then apply the pure precedence rule. */
export async function loadResolvedSetting(
  key: SettingKey,
  context: SettingContext,
  db: PrismaTransactionClient = prisma,
): Promise<ResolvedSetting> {
  await assertContext(db, context);
  const layers: SettingLayer[] = [];
  const targets: SettingTarget[] = [{ scope: 'platform', organisationId: context.organisationId }];
  if (context.eventId) targets.push({ scope: 'event', eventId: context.eventId });
  if (context.eventId && context.stationId) {
    targets.push({ scope: 'station', eventId: context.eventId, stationId: context.stationId });
  }
  for (const target of targets) {
    const row = await storedSetting(target, key, db);
    if (row) layers.push({ scope: target.scope as SettingScope, ...row });
  }
  const resolved = resolveSetting(key, layers);
  for (const scope of resolved.invalidScopes) {
    logger.error({ key, scope }, 'stored setting is invalid; using the next scope');
  }
  return resolved;
}
