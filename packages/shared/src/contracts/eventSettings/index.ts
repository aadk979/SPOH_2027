import { z } from 'zod';
import { Id } from '../common/index.js';

/**
 * Event settings (ADR-003): per event, versioned, changed one key at a time
 * with the version the caller read. Two product rules live here (ADR-002 §4);
 * the registry grows into every setting at P10.
 */

/**
 * The one count a headline is taken from. Never a sum: a registration, a
 * footfall tick and a Mission Card count different things (F01-048).
 */
export const HeadlineSource = z.discriminatedUnion('count', [
  z.object({ count: z.literal('registrations') }).strict(),
  /** Entries counted at one station, such as the front door. */
  z.object({ count: z.literal('footfall'), stationId: Id }).strict(),
  /** Mission Card journeys issued. */
  z.object({ count: z.literal('journeys') }).strict(),
]);
export type HeadlineSource = z.infer<typeof HeadlineSource>;

/** `separate`: the three counts side by side. `headline`: one of them on top as well. */
export const CountsMode = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('separate') }).strict(),
  z.object({ mode: z.literal('headline'), source: HeadlineSource }).strict(),
]);
export type CountsMode = z.infer<typeof CountsMode>;

/** `none`: no visitor personal data. `allowlist`: only the event's declared fields. */
export const VisitorDataMode = z.enum(['none', 'allowlist']);
export type VisitorDataMode = z.infer<typeof VisitorDataMode>;

export const EventSettings = z
  .object({
    'product.countsMode': CountsMode,
    'product.visitorDataMode': VisitorDataMode,
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
