import type { Action } from '@spoh/access-policies';
import { ValidationError } from '../errors/index.js';
import { SETTINGS } from '../settings/registry.js';
import type { ResourceRef } from './authorizer/index.js';

const SETTING_ACTIONS: Record<string, Action> = {
  operational: 'Settings.ManageEvent',
  security: 'Settings.ManageSecurity',
  privacy: 'Settings.ManagePrivacy',
};

/** The action that changes a setting follows its class (ADR-003, `CHANGES.md` C9). */
export function settingQuestion(key: string): { action: Action; resource: ResourceRef } {
  const definition = (SETTINGS as Record<string, { class: string } | undefined>)[key];
  if (!definition) throw new ValidationError(`Unknown setting ${key}`);
  const action = SETTING_ACTIONS[definition.class];
  if (!action) throw new ValidationError(`Unknown setting class ${definition.class}`);
  return { action, resource: { type: 'Setting', id: key } };
}
