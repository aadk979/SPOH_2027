/**
 * Reads the action catalogue out of the Cedar schema, so the schema is the one source for
 * action ids, groups and which actions per-event role grants may toggle.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const GROUPS = [
  'Capture',
  'Correct',
  'Safety',
  'Self',
  'Report',
  'Manage',
  'Configure',
  'Platform',
  'Editable',
  'Write',
];

export function schemaText() {
  return readFileSync(join(ROOT, 'schema.cedarschema'), 'utf8');
}

export function schemaJson() {
  const answer = cedar.schemaToJson(schemaText());
  if (answer.type !== 'success') throw new Error(JSON.stringify(answer.errors));
  return answer.json;
}

/** Every concrete action (not a group) with the groups it belongs to. */
export function actions() {
  const all = schemaJson().SPOH.actions;
  return Object.entries(all)
    .filter(([id]) => !GROUPS.includes(id))
    .map(([id, def]) => ({ id, groups: (def.memberOf ?? []).map((m) => m.id) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function editableActions() {
  return actions()
    .filter((a) => a.groups.includes('Editable'))
    .map((a) => a.id);
}
