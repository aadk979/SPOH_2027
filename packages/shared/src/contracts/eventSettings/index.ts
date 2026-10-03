import { z } from 'zod';
import { GENERATED_SETTING_SCHEMAS as settings } from '../../generated/settings/index.js';
import { CountsMode, HeadlineSource, VisitorDataMode } from './modes.js';
import { SettingChangeSource } from '../../invariants/enums.js';
import { Id, IdempotencyKey, IsoDateTime, PaginationQuery, collection } from '../common/index.js';
export { CountsMode, HeadlineSource, VisitorDataMode } from './modes.js';

/**
 * Event settings (ADR-003): per event, versioned, changed one key at a time
 * with the version the caller read. Two product rules live here (ADR-002 §4);
 * the registry grows into every setting at P10.
 */

export const EventSettings = z
  .object({
    'product.countsMode': settings['product.countsMode'],
    'product.visitorDataMode': settings['product.visitorDataMode'],
  })
  .strict();
export type EventSettings = z.infer<typeof EventSettings>;

export const EventSettingKey = EventSettings.keyof();
export type EventSettingKey = z.infer<typeof EventSettingKey>;

/** A key's stored version; 0 while it is still the default. */
const Version = z.number().int().nonnegative();

export const EventSettingsResponse = z
  .object({
    settings: EventSettings,
    versions: z
      .object({ 'product.countsMode': Version, 'product.visitorDataMode': Version })
      .strict(),
  })
  .strict();
export type EventSettingsResponse = z.infer<typeof EventSettingsResponse>;

const change = <Key extends EventSettingKey, Value extends z.ZodType>(key: Key, value: Value) =>
  z
    .object({
      key: z.literal(key),
      value,
      /** The version the caller read; a newer one makes this a 409. */
      expectedVersion: Version,
      reason: z.string().trim().max(500).optional(),
    })
    .strict();

/** One key at a time, with the version it was read at (ADR-003 §2). */
export const ChangeEventSettingRequest = z.discriminatedUnion('key', [
  change('product.countsMode', CountsMode),
  change('product.visitorDataMode', VisitorDataMode),
]);
export type ChangeEventSettingRequest = z.infer<typeof ChangeEventSettingRequest>;

/** Only the product settings whose guarded consumers already exist are exposed. */
export const EventSettingHistoryQuery = PaginationQuery.extend({ key: EventSettingKey }).strict();
export type EventSettingHistoryQuery = z.infer<typeof EventSettingHistoryQuery>;

function historyRecord<Key extends EventSettingKey, Value extends z.ZodType>(
  key: Key,
  value: Value,
) {
  return z
    .object({
      id: Id,
      eventId: Id,
      key: z.literal(key),
      version: z.number().int().positive(),
      source: SettingChangeSource,
      createdAt: IsoDateTime,
      createdByYou: z.boolean(),
      reason: z.string().max(500).nullable(),
      values: z.discriminatedUnion('available', [
        z.object({ available: z.literal(true), before: value.nullable(), after: value }).strict(),
        z.object({ available: z.literal(false) }).strict(),
      ]),
    })
    .strict();
}
export const EventSettingHistoryRecord = z.discriminatedUnion('key', [
  historyRecord('product.countsMode', CountsMode),
  historyRecord('product.visitorDataMode', VisitorDataMode),
]);
export type EventSettingHistoryRecord = z.infer<typeof EventSettingHistoryRecord>;
export const EventSettingHistoryResponse = collection(EventSettingHistoryRecord)
  .extend({
    eventId: Id,
    key: EventSettingKey,
    evaluatedAt: IsoDateTime,
    data: z.array(EventSettingHistoryRecord).max(200),
  })
  .strict()
  .refine(
    (response) =>
      response.meta.count === response.data.length &&
      response.data.every((row) => row.eventId === response.eventId && row.key === response.key) &&
      new Set(response.data.map(({ id }) => id)).size === response.data.length,
  );
export type EventSettingHistoryResponse = z.infer<typeof EventSettingHistoryResponse>;

/** Restoring a historical value is a new, reviewed and attributed write. */
export const RevertEventSettingRequest = z
  .object({
    key: EventSettingKey,
    historyId: Id,
    expectedVersion: Version,
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: IdempotencyKey,
  })
  .strict();
export type RevertEventSettingRequest = z.infer<typeof RevertEventSettingRequest>;
export const RevertEventSettingResponse = z
  .object({
    history: EventSettingHistoryRecord,
    current: EventSettingsResponse,
    reviewedVersion: Version,
    revertedFrom: z.object({ historyId: Id, version: z.number().int().positive() }).strict(),
  })
  .strict()
  .refine((response) => response.history.source === 'REVERT');
export type RevertEventSettingResponse = z.infer<typeof RevertEventSettingResponse>;

/**
 * One count shown on top, saying where it comes from (ADR-002 §4). It is
 * always that source's own figure, and the three counts are always shown
 * with it. Null in `separate` mode.
 */
export const Headline = z
  .object({
    source: HeadlineSource,
    /** Where the figure comes from, in words: "from registrations". */
    sourceLabel: z.string(),
    value: z.number().int().nonnegative(),
  })
  .strict();
export type Headline = z.infer<typeof Headline>;

/** The three counts as one response has them, for taking a headline from. */
export interface HeadlineCounts {
  registrations: number;
  journeys: number;
  footfall: ReadonlyArray<{ stationId: string; stationName: string; value: number }>;
}

/**
 * The headline a counts rule asks for: the chosen source's own figure, or
 * null. There is no branch that adds counts together (F01-048).
 */
export function headlineOf(mode: CountsMode, counts: HeadlineCounts): Headline | null {
  if (mode.mode === 'separate') return null;
  const { source } = mode;
  if (source.count === 'registrations') {
    return { source, sourceLabel: 'from registrations', value: counts.registrations };
  }
  if (source.count === 'journeys') {
    return { source, sourceLabel: 'from card journeys', value: counts.journeys };
  }
  const station = counts.footfall.find((row) => row.stationId === source.stationId);
  return {
    source,
    sourceLabel: `from entries counted at ${station?.stationName ?? 'the chosen station'}`,
    value: station?.value ?? 0,
  };
}
