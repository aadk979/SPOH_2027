import { CountsMode, VisitorDataMode, type EventStatus } from '@spoh/shared';
import { z } from 'zod';
import { parseCidr } from '../http/campusNetwork.js';

/** The one authored catalogue of settings, including their schemas and UI copy (ADR-003 §1). */
export type SettingScope = 'platform' | 'event' | 'station';
export type SettingClass = 'operational' | 'security' | 'privacy';

export interface SettingDefinition<Value> {
  key: string;
  scopes: readonly SettingScope[];
  schema: z.ZodType<Value>;
  default: Value;
  label: string;
  description: string;
  unit: string | null;
  requiredAction: 'event.settings.manage' | 'platform.settings.manage';
  group: string;
  schedulable: boolean;
  class: SettingClass;
  lockedIn: readonly EventStatus[];
  clientVisible: boolean;
  /** Type name for generated shared schemas when a default cannot express it. */
  typeName?: string;
  normalise?: 'trim';
}

type Options = Partial<
  Pick<
    SettingDefinition<unknown>,
    | 'scopes'
    | 'unit'
    | 'schedulable'
    | 'class'
    | 'lockedIn'
    | 'clientVisible'
    | 'typeName'
    | 'normalise'
  >
>;

// eslint-disable-next-line max-params, complexity -- the catalogue uses compact positional entries and this factory copies optional metadata without branching behaviour.
function setting<Schema extends z.ZodType>(
  key: string,
  schema: Schema,
  defaultValue: z.infer<Schema>,
  label: string,
  description: string,
  group: string,
  options: Options = {},
): SettingDefinition<z.infer<Schema>> {
  const scopes = options.scopes ?? ['event'];
  const classification = options.class ?? 'operational';
  return {
    key,
    scopes,
    schema: schema as z.ZodType<z.infer<Schema>>,
    default: defaultValue,
    label,
    description,
    group,
    unit: options.unit ?? null,
    schedulable:
      options.schedulable ??
      (classification === 'operational' &&
        scopes.includes('event') &&
        key !== 'product.countsMode'),
    class: classification,
    lockedIn: options.lockedIn ?? [],
    clientVisible: options.clientVisible ?? false,
    requiredAction:
      classification === 'operational' && scopes.includes('event')
        ? 'event.settings.manage'
        : 'platform.settings.manage',
    ...(options.typeName ? { typeName: options.typeName } : {}),
    ...(options.normalise ? { normalise: options.normalise } : {}),
  };
}

const minutes = () => z.number().int().min(1).max(1440);
const seconds = () => z.number().int().min(1).max(3600);
const platform = { scopes: ['platform'] as const };
const visible = { clientVisible: true };

export const SETTINGS = {
  'product.countsMode': setting(
    'product.countsMode',
    CountsMode,
    { mode: 'separate' },
    'Counts',
    'Separate shows registrations, footfall and journeys side by side. Headline adds one above them, labelled with its source. The counts are never added together.',
    'Product',
    { ...visible, lockedIn: ['ARCHIVED'], typeName: 'CountsMode' },
  ),
  'product.visitorDataMode': setting(
    'product.visitorDataMode',
    VisitorDataMode,
    'none',
    'Visitor personal data',
    'None keeps no visitor personal data. Allowlist accepts only declared fields, each with its own retention and readers.',
    'Product',
    { ...visible, class: 'privacy', lockedIn: ['CLOSED', 'ARCHIVED'], typeName: 'VisitorDataMode' },
  ),

  silentStationMinutes: setting(
    'silentStationMinutes',
    minutes(),
    15,
    'Silent station',
    'A counted room with no entries for this long during shift hours is flagged on the dashboard.',
    'Alerts',
    { ...visible, scopes: ['platform', 'event', 'station'], unit: 'minutes' },
  ),
  staleDeviceMinutes: setting(
    'staleDeviceMinutes',
    minutes(),
    15,
    'Stale device',
    'A checked-in device with no captures for this long is flagged in the IC console.',
    'Alerts',
    { ...visible, unit: 'minutes' },
  ),
  implausibleTapsPerMinute: setting(
    'implausibleTapsPerMinute',
    z.number().min(1).max(600),
    20,
    'Implausible tap rate',
    'Registrations per minute above which the IC console flags a device.',
    'Alerts',
    { scopes: ['platform', 'event', 'station'], unit: 'taps/minute' },
  ),
  longShiftMinutes: setting(
    'longShiftMinutes',
    minutes(),
    180,
    'Long shift',
    'Time on station without a break before someone appears on the welfare list.',
    'Welfare',
    { unit: 'minutes' },
  ),
  // Never longer than the 24 hours promised to families (ADR-003 §8, D-16).
  lostPersonPurgeHours: setting(
    'lostPersonPurgeHours',
    z.number().int().min(1).max(24),
    24,
    'Lost-person retention',
    'How long a resolved lost-person alert keeps its descriptive fields. Never longer than the 24 hours promised to families.',
    'Safety',
    { class: 'privacy', unit: 'hours' },
  ),
  idempotencyRetentionDays: setting(
    'idempotencyRetentionDays',
    z.number().int().min(1).max(90),
    7,
    'Replay retention',
    'How long a settled request is remembered so a retried tap is not counted twice.',
    'Capture',
    { ...platform, unit: 'days' },
  ),
  'privacy.mediaRetentionDays': setting(
    'privacy.mediaRetentionDays', z.number().int().min(1).max(365), 30,
    'Photo retention', 'Days after event close before lost-and-found photos are removed.',
    'Privacy', { class: 'privacy', unit: 'days', lockedIn: ['CLOSED', 'ARCHIVED'] },
  ),
  'privacy.staffRetentionDays': setting(
    'privacy.staffRetentionDays', z.number().int().min(1).max(3650), 365,
    'Archived staff retention', 'Days after archive before event staff notes are cleared. People with no remaining event are anonymised.',
    'Privacy', { class: 'privacy', unit: 'days', lockedIn: ['ARCHIVED'] },
  ),
  'identity.inviteDailyLimit': setting(
    'identity.inviteDailyLimit', z.number().int().min(1).max(100000), 50,
    'Daily identity email limit', 'Shared daily delivery allowance for the configured Cognito pool. Counts attempted invites and resends; raise only after its sender quota is confirmed.',
    'Identity', { ...platform, class: 'security', unit: 'emails/day' },
  ),
  refreshSessionDays: setting(
    'refreshSessionDays',
    z.number().int().min(1).max(90),
    30,
    'Session lifetime',
    'How long a volunteer stays signed in on a device; changes apply to new sessions.',
    'Identity',
    { ...platform, class: 'security', unit: 'days' },
  ),
  dashboardPollSeconds: setting(
    'dashboardPollSeconds',
    seconds(),
    3,
    'Dashboard refresh',
    'How often the dashboard and operations display reload; lower values add server load.',
    'Display',
    { ...platform, ...visible, schedulable: true, unit: 'seconds' },
  ),
  alertPollSeconds: setting(
    'alertPollSeconds',
    z.number().int().min(5).max(30),
    10,
    'Alert refresh',
    'How often devices check for lost-person alerts; this bounds alert delivery delay.',
    'Safety',
    { ...platform, ...visible, unit: 'seconds' },
  ),
  captureUndoWindowSeconds: setting(
    'captureUndoWindowSeconds',
    seconds(),
    10,
    'Undo window',
    'How long a volunteer can undo a tap before an IC must correct it.',
    'Capture',
    { ...visible, unit: 'seconds' },
  ),
  captureSendGraceSeconds: setting(
    'captureSendGraceSeconds',
    seconds(),
    2,
    'Send grace',
    'How long a tap waits before its first send so undo can cancel it outright.',
    'Capture',
    { ...visible, unit: 'seconds' },
  ),
  outboxWarningCount: setting(
    'outboxWarningCount',
    z.number().int().min(1).max(1000),
    20,
    'Unsent capture warning',
    'Unsent captures on one device before the volunteer is told to find an IC.',
    'Capture',
    { ...visible, unit: 'captures' },
  ),
  outboxWarningAgeMinutes: setting(
    'outboxWarningAgeMinutes',
    minutes(),
    5,
    'Oldest unsent warning',
    'Age of the oldest unsent capture that triggers the same warning.',
    'Capture',
    { ...visible, unit: 'minutes' },
  ),

  'attendance.rootMembershipId': setting(
    'attendance.rootMembershipId',
    z.string().min(1).max(64).nullable(),
    null,
    'Attendance root',
    'The event member allowed to issue and rotate attendance verifier credentials.',
    'Attendance',
    { class: 'security', typeName: 'string | null' },
  ),
  'attendance.campusCidrs': setting(
    'attendance.campusCidrs',
    z
      .array(
        z
          .string()
          .max(64)
          .refine(
            (cidr) => {
              try {
                parseCidr(cidr);
                return true;
              } catch {
                return false;
              }
            },
            { message: 'Enter a valid IPv4 or IPv6 CIDR range.' },
          ),
      )
      .max(20),
    [],
    'Trusted networks',
    'Venue IP ranges inside which QR attendance verification is allowed.',
    'Attendance',
    { class: 'security', typeName: 'string[]' },
  ),
  'attendance.campusNetworkLabel': setting(
    'attendance.campusNetworkLabel',
    z.string().trim().min(1).max(40),
    'venue Wi-Fi',
    'Trusted network name',
    'What volunteers call the venue network when QR attendance is refused.',
    'Attendance',
    { normalise: 'trim' },
  ),
  'attendance.pinAllowedOffNetwork': setting(
    'attendance.pinAllowedOffNetwork',
    z.boolean(),
    false,
    'Off-network PIN',
    'Whether attendance PIN verification is allowed outside trusted networks.',
    'Attendance',
    { class: 'security' },
  ),
  'auth.accessTokenTtlSeconds': setting(
    'auth.accessTokenTtlSeconds',
    z.number().int().min(60).max(3600),
    900,
    'Access token lifetime',
    'How long an API access token lives before the app renews it.',
    'Identity',
    { ...platform, class: 'security', unit: 'seconds' },
  ),
  'security.adminIdleMinutes': setting(
    'security.adminIdleMinutes',
    z.number().int().min(5).max(120),
    30,
    'Administrator idle timeout',
    'Minutes without an authenticated request before an administrator must sign in again.',
    'Identity',
    { ...platform, class: 'security', unit: 'minutes' },
  ),
  'security.adminSessionHours': setting(
    'security.adminSessionHours',
    z.number().int().min(1).max(24),
    12,
    'Administrator session limit',
    'Absolute session lifetime for administrator tiers, even while active.',
    'Identity',
    { ...platform, class: 'security', unit: 'hours' },
  ),
  'rateLimit.windowSeconds': setting(
    'rateLimit.windowSeconds',
    z.number().int().min(10).max(600),
    60,
    'Rate limit window',
    'The window in which each request limit is counted.',
    'Security',
    { ...platform, class: 'security', unit: 'seconds' },
  ),
  'rateLimit.max.default': setting(
    'rateLimit.max.default',
    z.number().int().min(1).max(100000),
    300,
    'Default request limit',
    'Requests one client may make to ordinary routes in one window.',
    'Security',
    { ...platform, class: 'security', unit: 'requests' },
  ),
  'rateLimit.max.capture': setting(
    'rateLimit.max.capture',
    z.number().int().min(1).max(100000),
    1200,
    'Capture request limit',
    'Capture requests one client may make in one window.',
    'Security',
    { ...platform, class: 'security', unit: 'requests' },
  ),
  'rateLimit.max.sensitive': setting(
    'rateLimit.max.sensitive',
    z.number().int().min(1).max(60),
    20,
    'Sensitive request limit',
    'Sensitive requests one client may make in one window.',
    'Security',
    { ...platform, class: 'security', unit: 'requests' },
  ),
  'rateLimit.max.admin': setting(
    'rateLimit.max.admin',
    z.number().int().min(1).max(100000),
    60,
    'Admin request limit',
    'Admin requests one client may make in one window.',
    'Security',
    { ...platform, class: 'security', unit: 'requests' },
  ),
  'media.uploadTtlSeconds': setting(
    'media.uploadTtlSeconds',
    z.number().int().min(30).max(3600),
    300,
    'Upload link lifetime',
    'How long a presigned photo upload link remains valid.',
    'Media',
    { ...platform, unit: 'seconds' },
  ),
  'media.maxUploadBytes': setting(
    'media.maxUploadBytes',
    z
      .number()
      .int()
      .min(1024)
      .max(50 * 1024 * 1024),
    10 * 1024 * 1024,
    'Maximum upload size',
    'Largest photo a volunteer may attach.',
    'Media',
    { ...platform, unit: 'bytes' },
  ),
  'push.ttlSeconds.lostPerson': setting(
    'push.ttlSeconds.lostPerson',
    seconds(),
    600,
    'Lost-person push lifetime',
    'How long a push service keeps trying a lost-person alert on an offline phone.',
    'Notifications',
    { ...platform, unit: 'seconds' },
  ),
  'push.ttlSeconds.incident': setting(
    'push.ttlSeconds.incident',
    seconds(),
    900,
    'Incident push lifetime',
    'How long a push service keeps trying an incident alert on an offline phone.',
    'Notifications',
    { ...platform, unit: 'seconds' },
  ),
  'push.ttlSeconds.announcement': setting(
    'push.ttlSeconds.announcement',
    seconds(),
    1800,
    'Announcement push lifetime',
    'How long a push service keeps trying an announcement on an offline phone.',
    'Notifications',
    { ...platform, unit: 'seconds' },
  ),
  'report.curveBucketMinutes': setting(
    'report.curveBucketMinutes',
    z.union([z.literal(15), z.literal(30), z.literal(60)]),
    30,
    'Report curve bucket',
    'Bucket size of the footfall curve and peak-period report.',
    'Reports',
    { unit: 'minutes', typeName: '15 | 30 | 60' },
  ),
  'incident.pushSeverities': setting(
    'incident.pushSeverities',
    z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])).max(4),
    ['HIGH', 'CRITICAL'],
    'Incident push severities',
    'Incident severities that also send a push alert to ICs.',
    'Safety',
    { typeName: "Array<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>" },
  ),
  'vocabulary.missionCard': setting(
    'vocabulary.missionCard',
    z.string().trim().min(1).max(40),
    'Mission Card',
    'Card name',
    'The event-facing name used for the visitor journey card.',
    'Vocabulary',
    { ...visible, normalise: 'trim' },
  ),
  'capture.open': setting(
    'capture.open',
    z.boolean(),
    true,
    'Capture open',
    'Whether a station may accept new captures during the event schedule.',
    'Capture',
    { scopes: ['event', 'station'], schedulable: true },
  ),
  'capture.lateSyncHours': setting(
    'capture.lateSyncHours',
    z.number().int().min(1).max(72),
    24,
    'Late sync grace',
    'How long offline captures recorded before close may arrive after the event closes.',
    'Capture',
    { unit: 'hours' },
  ),
} as const;

/** Product settings already stored per event since P09.14; all metadata comes from SETTINGS. */
export const EVENT_SETTINGS = {
  'product.countsMode': SETTINGS['product.countsMode'],
  'product.visitorDataMode': SETTINGS['product.visitorDataMode'],
  lostPersonPurgeHours: SETTINGS.lostPersonPurgeHours,
};

export type SettingKey = keyof typeof SETTINGS;
