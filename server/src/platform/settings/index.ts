import { RuntimeSettings, type UpdateSettingsRequest } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../db/client.js';
import { logger } from '../logger/index.js';
import { writeAudit, type AuditContext } from '../audit/index.js';

/**
 * Runtime settings.
 *
 * These values used to be constants in five different files: the shift block
 * boundaries in `time.ts`, `SILENT_STATION_MINUTES` in the footfall service,
 * `IMPLAUSIBLE_PER_MINUTE` and `STALE_DEVICE_MINUTES` in the dashboard,
 * `LONG_SHIFT_MINUTES` in the shift service, `PURGE_AFTER_HOURS` in the
 * lost-person service, and three more on the client. Every one of them is a
 * number somebody wants to change during a dry run, and changing a constant
 * means a deploy.
 *
 * The shift boundaries matter most: station scoping requires a block to be
 * running, so those two times decide whether the capture screens work at all.
 * Moving a rehearsal an hour earlier should not require a release.
 *
 * ── Why a synchronous cache ─────────────────────────────────────────────────
 *
 * `activeShiftBlocks()` is called from `requireStationScope`, which runs on
 * every capture write, and from a dozen pure functions that have no business
 * being async. So settings are loaded into memory at boot and refreshed on a
 * timer; readers get a synchronous snapshot. The cache starts populated with
 * the compiled defaults, which means:
 *
 *   - the server works before the first load, and if the load ever fails
 *   - an empty settings table is a working system
 *   - unit tests need no database
 *
 * A write refreshes this instance immediately and every other instance within
 * one refresh interval. That is the right trade: these values change a handful
 * of times across the event's life, and a minute of skew on a threshold is
 * unnoticeable where a minute of unavailability is not.
 */

/**
 * The compiled defaults — the values the system had before any of this was
 * configurable. Anything absent or invalid in the database falls back to these.
 */
export const DEFAULT_SETTINGS: RuntimeSettings = Object.freeze({
  eventName: 'SPOH 2027',

  // BUILD_PLAN §1.1. The blocks overlap between 13:30 and 14:00; that handover
  // is intentional and means a moment can belong to both.
  shiftBlocks: {
    MORNING: { start: '09:30', end: '14:00' },
    AFTERNOON: { start: '13:30', end: '18:00' },
  },

  silentStationMinutes: 15,
  staleDeviceMinutes: 15,
  implausibleTapsPerMinute: 20,
  longShiftMinutes: 180,

  lostPersonPurgeHours: 24,
  idempotencyRetentionDays: 7,
  refreshSessionDays: 30,

  dashboardPollSeconds: 3,
  alertPollSeconds: 10,

  captureUndoWindowSeconds: 10,
  captureSendGraceSeconds: 2,
  outboxWarningCount: 20,
  outboxWarningAgeMinutes: 5,
});

export type SettingKey = keyof RuntimeSettings;

/** Per-key schemas, so one bad stored value cannot invalidate the whole set. */
const KEY_SCHEMAS = RuntimeSettings.shape;

let cache: RuntimeSettings = DEFAULT_SETTINGS;
let overridden: SettingKey[] = [];
let meta: { updatedAt: Date | null; updatedById: string | null } = {
  updatedAt: null,
  updatedById: null,
};

/** The current settings. Synchronous, always populated, never throws. */
export function getSettings(): RuntimeSettings {
  return cache;
}

/** Which keys are stored rather than defaulted, for the admin screen. */
export function settingsMeta(): {
  overriddenKeys: SettingKey[];
  updatedAt: Date | null;
  updatedById: string | null;
} {
  return {
    overriddenKeys: [...overridden],
    updatedAt: meta.updatedAt,
    updatedById: meta.updatedById,
  };
}

/**
 * Read every stored setting and rebuild the cache.
 *
 * Deliberately total: a row that fails validation is logged and skipped rather
 * than thrown, because a typo in one threshold must not stop the server from
 * booting on the morning of the event. The default it falls back to is by
 * definition a value that worked.
 */
export async function loadSettings(): Promise<RuntimeSettings> {
  let rows: Array<{ key: string; value: unknown; updatedAt: Date; updatedById: string | null }>;

  try {
    rows = await prisma.appSetting.findMany({
      select: { key: true, value: true, updatedAt: true, updatedById: true },
    });
  } catch (error) {
    // Boot ordering, a migration mid-deploy, a transient connection failure.
    // The defaults are already in place, so this is a warning, not a stop.
    logger.warn({ err: error }, 'could not read runtime settings; using compiled defaults');
    return cache;
  }

  const next: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const applied: SettingKey[] = [];
  let latest: Date | null = null;
  let latestBy: string | null = null;

  for (const row of rows) {
    const schema = KEY_SCHEMAS[row.key as SettingKey];
    if (!schema) {
      logger.warn({ key: row.key }, 'unknown runtime setting stored; ignoring');
      continue;
    }

    const parsed = schema.safeParse(row.value);
    if (!parsed.success) {
      logger.error(
        { key: row.key, issues: parsed.error.issues },
        'stored runtime setting is invalid; falling back to the compiled default',
      );
      continue;
    }

    next[row.key] = parsed.data;
    applied.push(row.key as SettingKey);

    if (!latest || row.updatedAt > latest) {
      latest = row.updatedAt;
      latestBy = row.updatedById;
    }
  }

  cache = Object.freeze(next) as RuntimeSettings;
  overridden = applied;
  meta = { updatedAt: latest, updatedById: latestBy };

  return cache;
}

/**
 * Write a patch and refresh this instance immediately.
 *
 * One row per top-level key, so two admins changing different settings do not
 * overwrite each other — which a single blob row would allow, silently.
 */
export async function updateSettings(
  patch: UpdateSettingsRequest,
  actorId: string | null,
  audit: AuditContext,
): Promise<RuntimeSettings> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  const before = cache;

  await prisma.$transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx.appSetting.upsert({
        where: { key },
        create: { key, value: value as object, updatedById: actorId },
        update: { value: value as object, updatedById: actorId },
      });
    }

    await writeAudit(tx, {
      ...audit,
      action: 'settings.update',
      entityType: 'AppSetting',
      entityId: null,
      before: Object.fromEntries(
        entries.map(([key]) => [key, before[key as SettingKey]]),
      ) as object,
      after: Object.fromEntries(entries) as object,
    });
  });

  return loadSettings();
}

/** Reset keys to their compiled defaults by removing the stored override. */
export async function clearSettings(
  keys: SettingKey[],
  audit: AuditContext,
  tx: PrismaTransactionClient = prisma,
): Promise<RuntimeSettings> {
  await tx.appSetting.deleteMany({ where: { key: { in: keys } } });
  await writeAudit(tx, {
    ...audit,
    action: 'settings.update',
    entityType: 'AppSetting',
    entityId: null,
    after: { reset: keys } as object,
  });
  return loadSettings();
}

/**
 * Test seam. Replaces the cache without touching the database, so a unit test
 * can exercise a threshold without standing one up.
 */
export function overrideSettingsForTest(patch: Partial<RuntimeSettings>): () => void {
  const previous = cache;
  cache = Object.freeze({ ...cache, ...patch }) as RuntimeSettings;
  return () => {
    cache = previous;
  };
}
