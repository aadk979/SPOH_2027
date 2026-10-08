import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { GROUPS, actions, schemaJson } from '../lib/catalogue.mjs';
import {
  ACTION_CATALOGUE,
  ACTION_GROUPS,
  ACTION_IDS,
  EDITABLE_ACTION_IDS,
  WRITE_ACTION_IDS,
} from '../src/generated/actions.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(ROOT, '..', '..', 'remediation', 'reports', 'P05', 'cedar');

test('generated action catalogue names all 66 actions and ten groups from the Cedar schema', () => {
  assert.equal(ACTION_IDS.length, 66);
  assert.equal(new Set(ACTION_IDS).size, 66);
  assert.deepEqual(
    ACTION_IDS,
    actions()
      .map(({ id }) => id)
      .sort(),
  );
  assert.deepEqual(ACTION_GROUPS, GROUPS);
  assert.deepEqual(Object.keys(ACTION_CATALOGUE), ACTION_IDS);
});

test('every generated action preserves its principal, resource and action groups', () => {
  const definitions = schemaJson().SPOH.actions;
  for (const action of ACTION_IDS) {
    const definition = definitions[action];
    assert.deepEqual(
      {
        groups: ACTION_CATALOGUE[action].groups,
        principalTypes: ACTION_CATALOGUE[action].principalTypes,
        resourceTypes: ACTION_CATALOGUE[action].resourceTypes,
      },
      {
        groups: definition.memberOf.map(({ id }) => id).sort(),
        principalTypes: [...definition.appliesTo.principalTypes].sort(),
        resourceTypes: [...definition.appliesTo.resourceTypes].sort(),
      },
      action,
    );
  }
});

test('editable and write catalogue entries derive exactly from their schema groups', () => {
  assert.equal(EDITABLE_ACTION_IDS.length, 47);
  for (const [group, generated] of [
    ['Editable', EDITABLE_ACTION_IDS],
    ['Write', WRITE_ACTION_IDS],
  ]) {
    assert.deepEqual(
      generated,
      ACTION_IDS.filter((action) => ACTION_CATALOGUE[action].groups.includes(group)),
    );
  }
  for (const locked of [
    'Permissions.Edit',
    'Settings.ManageSecurity',
    'Settings.ManagePrivacy',
    'Event.Reopen',
    'Event.Archive',
  ]) {
    assert.ok(!EDITABLE_ACTION_IDS.includes(locked), locked);
  }
});

test('generated standalone TypeScript metadata is current and has no runtime imports', () => {
  execFileSync(process.execPath, [join(ROOT, 'tools', 'generate-actions.mjs'), '--check']);
  const text = readFileSync(join(ROOT, 'src', 'generated', 'actions.ts'), 'utf8');
  assert.doesNotMatch(text, /^import\s/m);
});

test('accepted schema, policies, role defaults and C1-C16 changes remain byte-identical to the P05 bench, as amended by D-21', () => {
  const policyFiles = readdirSync(join(ROOT, 'policies')).filter((file) => file.endsWith('.cedar'));
  for (const file of [
    'schema.cedarschema',
    'default-grants.json',
    'CHANGES.md',
    ...policyFiles.map((file) => join('policies', file)),
  ]) {
    assert.deepEqual(readFileSync(join(ROOT, file)), readFileSync(join(BENCH, file)), file);
  }
});

test('every policy source states its guarantees in a header comment', () => {
  for (const file of readdirSync(join(ROOT, 'policies')).filter((file) =>
    file.endsWith('.cedar'),
  )) {
    const header = readFileSync(join(ROOT, 'policies', file), 'utf8').split('@id(')[0];
    assert.match(header, /^\/\//, file);
    assert.match(header, /Guarantees:|Role policies/, file);
  }
});
