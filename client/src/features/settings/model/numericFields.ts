import type { RuntimeSettings } from '@spoh/shared';
export interface FieldSpec {
  key: keyof RuntimeSettings;
  label: string;
  hint: string;
  unit: string;
  min: number;
  max: number;
}

export const NUMERIC_FIELDS: readonly FieldSpec[] = [
  {
    key: 'silentStationMinutes',
    label: 'Station silence',
    hint: 'A counted room with nothing recorded for this long is flagged on the dashboard. Lower catches a stopped counter sooner and cries wolf during a genuine lull.',
    unit: 'minutes',
    min: 1,
    max: 1440,
  },
  {
    key: 'staleDeviceMinutes',
    label: 'Device silence',
    hint: 'A volunteer who has checked in but captured nothing for this long appears on the data-health list.',
    unit: 'minutes',
    min: 1,
    max: 1440,
  },
  {
    key: 'implausibleTapsPerMinute',
    label: 'Implausible tap rate',
    hint: 'Registrations per minute above which the IC console flags a device. Usually means somebody is tapping to catch up rather than counting arrivals.',
    unit: 'per minute',
    min: 1,
    max: 600,
  },
  {
    key: 'longShiftMinutes',
    label: 'Welfare threshold',
    hint: 'Time on station without a break before somebody appears on the welfare list.',
    unit: 'minutes',
    min: 1,
    max: 1440,
  },
  {
    key: 'lostPersonPurgeHours',
    label: 'Lost-person retention',
    hint: 'How long a resolved alert keeps its description before it is reduced to timings and an outcome. Shorter is safer; too short and the morning-after report loses the case.',
    unit: 'hours',
    min: 1,
    max: 720,
  },
  {
    key: 'captureUndoWindowSeconds',
    label: 'Undo window',
    hint: 'How long a volunteer can undo a tap. After this only an IC can void the record.',
    unit: 'seconds',
    min: 1,
    max: 3600,
  },
  {
    key: 'captureSendGraceSeconds',
    label: 'Send delay',
    hint: 'How long a tap waits before its first send, so undo can still cancel it outright. Longer makes undo more reliable and the dashboard slower to reflect a capture.',
    unit: 'seconds',
    min: 1,
    max: 3600,
  },
  {
    key: 'dashboardPollSeconds',
    label: 'Dashboard refresh',
    hint: 'How often the live dashboard and the ops-room display reload.',
    unit: 'seconds',
    min: 1,
    max: 3600,
  },
  {
    key: 'alertPollSeconds',
    label: 'Alert check',
    hint: 'How often every device checks for an active lost-person alert. This is the delivery guarantee — push is best effort on top of it.',
    unit: 'seconds',
    min: 1,
    max: 3600,
  },
  {
    key: 'outboxWarningCount',
    label: 'Unsent capture warning',
    hint: 'Unsent captures on one device before the volunteer is told to find their IC.',
    unit: 'captures',
    min: 1,
    max: 1000,
  },
  {
    key: 'outboxWarningAgeMinutes',
    label: 'Unsent capture age',
    hint: 'Age of the oldest unsent capture that triggers the same warning.',
    unit: 'minutes',
    min: 1,
    max: 1440,
  },
  {
    key: 'idempotencyRetentionDays',
    label: 'Idempotency retention',
    hint: 'How long a settled idempotency record is kept for replay.',
    unit: 'days',
    min: 1,
    max: 90,
  },
  {
    key: 'refreshSessionDays',
    label: 'Session duration',
    hint: 'How long a refresh session lives before the volunteer signs in again.',
    unit: 'days',
    min: 1,
    max: 90,
  },
];
