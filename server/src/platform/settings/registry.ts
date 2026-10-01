import {
  CountsMode,
  VisitorDataMode,
  type EventSettingKey,
  type EventSettings,
  type EventStatus,
} from '@spoh/shared';
import type { z } from 'zod';

/**
 * The settings registry (ADR-003 §1): the one definition of each setting.
 * It holds the event's product rules for now (ADR-002 §4, P09.14); P10.1
 * moves every runtime setting into it.
 */
export interface SettingDefinition<Value> {
  key: EventSettingKey;
  schema: z.ZodType<Value>;
  /** The compiled default: today's behaviour, so an unset event runs as Event #1 did. */
  default: Value;
  label: string;
  /** What changing it does. */
  description: string;
  /** Picks the permission and whether a value may be logged (ADR-005). */
  class: 'operational' | 'security' | 'privacy';
  /** Event states in which the key cannot change (ADR-004). */
  lockedIn: readonly EventStatus[];
}

type Registry = { [Key in EventSettingKey]: SettingDefinition<EventSettings[Key]> };

export const EVENT_SETTINGS: Registry = {
  'product.countsMode': {
    key: 'product.countsMode',
    schema: CountsMode,
    default: { mode: 'separate' },
    label: 'Counts',
    description:
      'Separate shows registrations, footfall and journeys side by side. Headline adds one ' +
      'of them on top, labelled with where it comes from. The counts are never added together.',
    class: 'operational',
    lockedIn: ['ARCHIVED'],
  },
  'product.visitorDataMode': {
    key: 'product.visitorDataMode',
    schema: VisitorDataMode,
    default: 'none',
    label: 'Visitor personal data',
    description:
      'None keeps no visitor personal data. Allowlist lets the event collect only the fields ' +
      'it declares, each with its own retention and readers.',
    class: 'privacy',
    // Turning it on is further limited to the states before the event runs.
    lockedIn: ['CLOSED', 'ARCHIVED'],
  },
};
