import { performance } from 'node:perf_hooks';
import type { Request } from 'express';
import { prisma } from '../db/client.js';
import { onCacheBusRecovered, subscribeCacheEvent } from '../events/cacheBus.js';
import { logger } from '../logger/index.js';
import { SETTINGS } from '../settings/registry.js';
import { resolveSetting } from '../settings/resolve.js';

export type RateLimitTier = 'default' | 'capture' | 'sensitive' | 'admin';

export interface RateLimitPolicy {
  organisationId: string | null;
  windowSeconds: number;
  max: number;
}

type RateLimitValues = Record<'windowSeconds' | RateLimitTier, number>;

const MAX_KEYS = {
  default: 'rateLimit.max.default',
  capture: 'rateLimit.max.capture',
  sensitive: 'rateLimit.max.sensitive',
  admin: 'rateLimit.max.admin',
} as const;
const WINDOW_KEY = 'rateLimit.windowSeconds';
const POLICY_KEYS = [WINDOW_KEY, ...Object.values(MAX_KEYS)];
const CACHE_MS = 1_000;
const values = new Map<string, { expiresAt: number; load: Promise<RateLimitValues> }>();
const eventOrganisations = new Map<string, string>();

/** Forget process-local snapshots after a committed write or test database reset. */
export function invalidateRateLimitPolicy(): void {
  values.clear();
  eventOrganisations.clear();
}

function resolvedNumber(
  key: typeof WINDOW_KEY | (typeof MAX_KEYS)[RateLimitTier],
  rows: readonly { key: string; value: unknown; version: number }[],
): number {
  const row = rows.find((candidate) => candidate.key === key);
  const resolved = resolveSetting(
    key,
    row ? [{ scope: 'platform', value: row.value, version: row.version }] : [],
  );
  if (resolved.invalidScopes.length) {
    logger.error({ key }, 'stored rate limit setting is invalid; using the registry default');
  }
  return resolved.value as number;
}

async function loadValues(organisationId: string): Promise<RateLimitValues> {
  const rows = await prisma.setting.findMany({
    where: {
      scope: 'PLATFORM',
      scopeId: organisationId,
      eventId: null,
      key: { in: POLICY_KEYS },
    },
    select: { key: true, value: true, version: true },
  });
  return {
    windowSeconds: resolvedNumber(WINDOW_KEY, rows),
    default: resolvedNumber(MAX_KEYS.default, rows),
    capture: resolvedNumber(MAX_KEYS.capture, rows),
    sensitive: resolvedNumber(MAX_KEYS.sensitive, rows),
    admin: resolvedNumber(MAX_KEYS.admin, rows),
  };
}

function valuesFor(organisationId: string): Promise<RateLimitValues> {
  const now = performance.now();
  const cached = values.get(organisationId);
  if (cached && cached.expiresAt > now) return cached.load;
  const load = loadValues(organisationId);
  values.set(organisationId, { expiresAt: now + CACHE_MS, load });
  void load.catch(() => {
    if (values.get(organisationId)?.load === load) values.delete(organisationId);
  });
  return load;
}

async function organisationFor(req: Request): Promise<string | null> {
  // Only authenticated event context may select an organisation. The public
  // sign-in paths use Event #1's organisation, regardless of the submitted
  // email, query or path. Before the first event exists, use the oldest
  // organisation so its administrator can still sign in to set up an event.
  if (!req.auth) {
    const firstEvent = await prisma.event.findFirst({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { organisationId: true },
    });
    if (firstEvent) return firstEvent.organisationId;
    const first = await prisma.organisation.findFirst({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return first?.id ?? null;
  }
  const eventId = req.auth.eventId;
  const known = eventOrganisations.get(eventId);
  if (known) return known;
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organisationId: true },
  });
  eventOrganisations.set(eventId, event.organisationId);
  return event.organisationId;
}

/** A bounded, live policy for the caller's organisation and route class. */
export async function rateLimitPolicy(req: Request, tier: RateLimitTier): Promise<RateLimitPolicy> {
  const organisationId = await organisationFor(req);
  if (!organisationId) {
    return {
      organisationId: null,
      windowSeconds: SETTINGS[WINDOW_KEY].default,
      max: SETTINGS[MAX_KEYS[tier]].default,
    };
  }
  const policy = await valuesFor(organisationId);
  return { organisationId, windowSeconds: policy.windowSeconds, max: policy[tier] };
}

subscribeCacheEvent('settings', invalidateRateLimitPolicy);
onCacheBusRecovered(invalidateRateLimitPolicy);
