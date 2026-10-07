import { z } from 'zod';
import { GENERATED_SETTING_SCHEMAS as settings } from '../../generated/settings/index.js';
import { Id } from '../common/index.js';

/**
 * Organisation-wide settings (platform scope, ADR-003): every event of the
 * organisation runs with them. Only the organisation's platform admins change
 * them (D-17); event Chiefs and Admins can read them.
 */
export const OrganisationSettings = z
  .object({
    dashboardPollSeconds: settings.dashboardPollSeconds,
    alertPollSeconds: settings.alertPollSeconds,
    refreshSessionDays: settings.refreshSessionDays,
    idempotencyRetentionDays: settings.idempotencyRetentionDays,
  })
  .strict();
export type OrganisationSettings = z.infer<typeof OrganisationSettings>;

export const OrganisationSettingKey = OrganisationSettings.keyof();
export type OrganisationSettingKey = z.infer<typeof OrganisationSettingKey>;

/** A key's stored version; 0 while it is still the default. */
const Version = z.number().int().nonnegative();

export const OrganisationSettingsResponse = z
  .object({
    organisationId: Id,
    settings: OrganisationSettings,
    versions: z
      .object({
        dashboardPollSeconds: Version,
        alertPollSeconds: Version,
        refreshSessionDays: Version,
        idempotencyRetentionDays: Version,
      })
      .strict(),
    /** Whether the caller is a platform admin of this organisation. */
    canChange: z.boolean(),
  })
  .strict();
export type OrganisationSettingsResponse = z.infer<typeof OrganisationSettingsResponse>;

const change = <Key extends OrganisationSettingKey, Value extends z.ZodType>(
  key: Key,
  value: Value,
) =>
  z
    .object({
      key: z.literal(key),
      value,
      /** The version the caller read; a newer one makes this a 409. */
      expectedVersion: Version,
      reason: z.string().trim().max(500).optional(),
    })
    .strict();

/** One key at a time, with the version it was read at. */
export const ChangeOrganisationSettingRequest = z.discriminatedUnion('key', [
  change('dashboardPollSeconds', settings.dashboardPollSeconds),
  change('alertPollSeconds', settings.alertPollSeconds),
  change('refreshSessionDays', settings.refreshSessionDays),
  change('idempotencyRetentionDays', settings.idempotencyRetentionDays),
]);
export type ChangeOrganisationSettingRequest = z.infer<typeof ChangeOrganisationSettingRequest>;
