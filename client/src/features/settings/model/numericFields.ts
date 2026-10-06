import { GENERATED_SETTING_METADATA, type RuntimeSettings } from '@spoh/shared';

export interface FieldSpec {
  key: keyof RuntimeSettings;
  label: string;
  hint: string;
  unit: string;
  min: number;
  max: number;
  /** Whether the catalogue also accepts a per-station value for this key. */
  stationScope: boolean;
}

/** Display order only. Copy and bounds come from the server registry (P10.1). */
const ORDER = [
  'silentStationMinutes',
  'staleDeviceMinutes',
  'implausibleTapsPerMinute',
  'longShiftMinutes',
  'lostPersonPurgeHours',
  'captureUndoWindowSeconds',
  'captureSendGraceSeconds',
  'dashboardPollSeconds',
  'alertPollSeconds',
  'outboxWarningCount',
  'outboxWarningAgeMinutes',
  'idempotencyRetentionDays',
  'refreshSessionDays',
] as const satisfies readonly (keyof RuntimeSettings)[];

function numericField(key: (typeof ORDER)[number]): FieldSpec {
  const metadata = GENERATED_SETTING_METADATA[key];
  const bounds = metadata.jsonSchema as { minimum?: number; maximum?: number };
  if (bounds.minimum === undefined || bounds.maximum === undefined) {
    throw new Error(`${key} has no numeric bounds in the settings registry`);
  }
  return {
    key,
    label: metadata.label,
    hint: metadata.description,
    unit: metadata.unit ?? '',
    min: bounds.minimum,
    max: bounds.maximum,
    stationScope: (metadata.scopes as readonly string[]).includes('station'),
  };
}

export const NUMERIC_FIELDS: readonly FieldSpec[] = ORDER.map(numericField);
