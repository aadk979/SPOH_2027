// The schema parses, every policy validates against it in STRICT mode (the mode the AVP policy
// store will use), the generated grants are current, and the default grants only name Editable
// actions.
import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { POLICIES, DEFAULT_GRANTS, ROLES } from '../lib/bench.mjs';
import { actions, editableActions, schemaText } from '../lib/catalogue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the schema parses', () => {
  assert.deepEqual(cedar.checkParseSchema(schemaText()), { type: 'success' });
});

test('every policy validates against the schema in strict mode', () => {
  const answer = cedar.validate({
    schema: schemaText(),
    policies: { staticPolicies: POLICIES },
    validationSettings: { mode: 'strict' },
  });
  assert.equal(answer.type, 'success', JSON.stringify(answer));
  assert.deepEqual(answer.validationErrors, [], JSON.stringify(answer.validationErrors, null, 2));
  assert.deepEqual(answer.validationWarnings, []);
});

test('the policy set has the five hand-written files plus one grant per Editable action', () => {
  const ids = Object.keys(POLICIES);
  const grants = ids.filter((id) => id.startsWith('grant.'));
  assert.equal(grants.length, editableActions().length);
  for (const prefix of ['station-scope.', 'guardrail.', 'self.', 'attendance.', 'platform.']) {
    assert.ok(
      ids.some((id) => id.startsWith(prefix)),
      `no policy with prefix ${prefix}`,
    );
  }
});

test('grants.generated.cedar is up to date', () => {
  execFileSync(process.execPath, [join(ROOT, 'tools', 'generate-grants.mjs'), '--check']);
});

test('default grants name only Editable actions, and every action belongs to a functional group', () => {
  const editable = new Set(editableActions());
  for (const role of ROLES) {
    for (const action of DEFAULT_GRANTS[role].grants) {
      assert.ok(editable.has(action), `${role} is granted ${action}, which is not Editable`);
    }
  }
  const functional = [
    'Capture',
    'Correct',
    'Safety',
    'Self',
    'Report',
    'Manage',
    'Configure',
    'Platform',
  ];
  for (const { id, groups } of actions()) {
    assert.ok(
      groups.some((g) => functional.includes(g)),
      `${id} has no functional group`,
    );
  }
});
