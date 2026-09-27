import type { SettingsResponse, UpdateSettingsRequest } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { getSettings, settingsMeta, updateSettings } from '../../../platform/settings/index.js';
import { findVolunteerName } from '../data/repo.js';

function withMeta(
  settings: SettingsResponse['settings'],
  updatedByName: string | null,
): SettingsResponse {
  const meta = settingsMeta();
  return {
    settings,
    overriddenKeys: meta.overriddenKeys,
    updatedAt: meta.updatedAt?.toISOString() ?? null,
    updatedById: meta.updatedById,
    updatedByName,
  };
}

/** The live settings, which overrides are set, and who last changed them. */
export async function getSettingsView(): Promise<SettingsResponse> {
  const { updatedById } = settingsMeta();
  const name = updatedById ? await findVolunteerName(updatedById) : null;
  return withMeta(getSettings(), name);
}

/** Change settings; the answer names the person who just did. */
export async function updateSettingsView(
  patch: UpdateSettingsRequest,
  actor: ActorContext & { displayName: string },
): Promise<SettingsResponse> {
  const settings = await updateSettings(patch, actor.volunteerId, actor.audit);
  return withMeta(settings, actor.displayName);
}
