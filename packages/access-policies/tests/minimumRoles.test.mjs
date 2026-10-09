import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { actions } from '../lib/catalogue.mjs';
import { minimumRoles, ROLE_RANKS as FIXED_RANKS } from '../lib/minimumRoles.mjs';
import { ACTION_CATALOGUE, ROLE_IDS, ROLE_RANKS } from '../src/generated/actions.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
const defaults = readJson('default-grants.json');
const decision = readJson('minimum-roles.json');
const catalogue = actions();

test('the approved 46 floors are complete fixed metadata with the six unchanged role ranks', () => {
  assert.deepEqual(ROLE_RANKS, {
    VOLUNTEER: 10,
    IC: 20,
    DEPUTY_COORDINATOR: 30,
    CHIEF_COORDINATOR: 40,
    LEAD: 50,
    ADMIN: 60,
  });
  assert.deepEqual(ROLE_IDS, Object.keys(ROLE_RANKS));
  // The derived floors; VisitorRecord.Read's is the owner's own (D-15), tested below.
  const approved = Object.entries(ACTION_CATALOGUE).filter(
    ([action, metadata]) =>
      metadata.minimumRole.status === 'approved' && action !== 'VisitorRecord.Read',
  );
  assert.equal(approved.length, 46);
  const counts = Object.fromEntries(ROLE_IDS.map((role) => [role, 0]));
  for (const [action, metadata] of approved) {
    const role = ROLE_IDS.find((candidate) => defaults[candidate].grants.includes(action));
    assert.deepEqual(metadata.minimumRole, { status: 'approved', role, rank: ROLE_RANKS[role] });
    counts[role] += 1;
  }
  assert.deepEqual(counts, {
    VOLUNTEER: 8,
    IC: 12,
    DEPUTY_COORDINATOR: 8,
    CHIEF_COORDINATOR: 18,
    LEAD: 0,
    ADMIN: 0,
  });
  assert.deepEqual(
    minimumRoles(catalogue, defaults, decision),
    Object.fromEntries(Object.entries(ACTION_CATALOGUE).map(([id, row]) => [id, row.minimumRole])),
  );
});

test('VisitorRecord.Read takes the owner-decided floor of D-15 and still has no default grant', () => {
  assert.deepEqual(ACTION_CATALOGUE['VisitorRecord.Read'].minimumRole, {
    status: 'approved',
    role: 'VOLUNTEER',
    rank: 10,
  });
  assert.deepEqual(decision.unresolved, []);
  assert.deepEqual(decision.ownerFloors, {
    'VisitorRecord.Read': { role: 'VOLUNTEER', decision: 'D-15 = A', date: '2026-10-09' },
  });
  assert.ok(!Object.hasOwn(decision.floors, 'VisitorRecord.Read'));
  for (const role of ROLE_IDS) assert.ok(!defaults[role].grants.includes('VisitorRecord.Read'));
  // Without the owner's decision it can only be unresolved, never a derived floor.
  for (const role of ROLE_IDS) {
    const altered = structuredClone(decision);
    altered.ownerFloors = {};
    altered.floors['VisitorRecord.Read'] = role;
    assert.throws(() => minimumRoles(catalogue, defaults, altered), /lowest approved default role/);
  }
});

test('an owner-decided floor is only for an action no role holds by default', () => {
  const altered = structuredClone(decision);
  delete altered.floors['People.Read'];
  altered.ownerFloors['People.Read'] = {
    role: 'VOLUNTEER',
    decision: 'D-99 = A',
    date: '2026-10-09',
  };
  assert.throws(
    () => minimumRoles(catalogue, defaults, altered),
    /only for an action without defaults/,
  );
  for (const malformed of [
    { role: 'EVENT_OWNER', decision: 'D-15 = A', date: '2026-10-09' },
    { role: 'VOLUNTEER', decision: 'the owner said so', date: '2026-10-09' },
    { role: 'VOLUNTEER', decision: 'D-15 = A' },
  ]) {
    const bad = structuredClone(decision);
    bad.ownerFloors['VisitorRecord.Read'] = malformed;
    assert.throws(() => minimumRoles(catalogue, defaults, bad));
  }
});

test('each approved floor refuses a lower or higher substitute rather than silently changing scope', () => {
  for (const [action, floor] of Object.entries(decision.floors)) {
    const index = ROLE_IDS.indexOf(floor);
    for (const replacement of [ROLE_IDS[index - 1], ROLE_IDS[index + 1]].filter(Boolean)) {
      const altered = structuredClone(decision);
      altered.floors[action] = replacement;
      assert.throws(
        () => minimumRoles(catalogue, defaults, altered),
        /lowest approved default role/,
        `${action}: ${floor} -> ${replacement}`,
      );
    }
  }
});

test('locked actions never receive a floor or permission-editor grant eligibility', () => {
  const locked = catalogue.filter(({ groups }) => !groups.includes('Editable'));
  assert.equal(locked.length, 19);
  for (const { id } of locked) {
    assert.deepEqual(ACTION_CATALOGUE[id].minimumRole, { status: 'locked' });
    const altered = structuredClone(decision);
    altered.floors[id] = 'ADMIN';
    assert.throws(() => minimumRoles(catalogue, defaults, altered), /exactly Editable actions/);
  }
});

test('generation refuses incomplete, overlapping, unknown and malformed floor declarations', () => {
  const mutations = [
    (value) => delete value.floors['People.Read'],
    (value) => (value.floors['People.Read'] = 'EVENT_OWNER'),
    (value) => (value.floors['People.Read'] = 30),
    (value) => (value.floors['Unknown.Action'] = 'ADMIN'),
    (value) => (value.floors.Editable = 'VOLUNTEER'),
    (value) => value.unresolved.push('People.Read'),
    (value) => value.unresolved.push('VisitorRecord.Read'),
    (value) => (value.unresolved = 'VisitorRecord.Read'),
    (value) => delete value.ownerFloors,
    (value) => (value.floors = []),
    (value) => (value.derivedFloors = true),
  ];
  for (const mutate of mutations) {
    const altered = structuredClone(decision);
    mutate(altered);
    assert.throws(() => minimumRoles(catalogue, defaults, altered));
  }
});

test('generation refuses changed approval provenance, rank ordering or default minima', () => {
  for (const key of ['date', 'decision']) {
    const altered = structuredClone(decision);
    altered.approval[key] = 'pending';
    assert.throws(() => minimumRoles(catalogue, defaults, altered), /owner decision/);
  }
  for (const role of ROLE_IDS) {
    const altered = structuredClone(defaults);
    altered[role].rank = FIXED_RANKS[role] + 1;
    assert.throws(() => minimumRoles(catalogue, altered, decision), /fixed rank/);
  }
  const lowerGrant = structuredClone(defaults);
  lowerGrant.IC.grants.push('People.Read');
  assert.throws(
    () => minimumRoles(catalogue, lowerGrant, decision),
    /lowest approved default role/,
  );
  const visitorGrant = structuredClone(defaults);
  visitorGrant.ADMIN.grants.push('VisitorRecord.Read');
  assert.throws(
    () => minimumRoles(catalogue, visitorGrant, decision),
    /only for an action without defaults/,
  );
});

test('floors do not turn nonmonotonic default exclusions into grants', () => {
  assert.deepEqual(ACTION_CATALOGUE['Registration.Create'].minimumRole, {
    status: 'approved',
    role: 'VOLUNTEER',
    rank: 10,
  });
  assert.deepEqual(ACTION_CATALOGUE['LostFound.CloseOut'].minimumRole, {
    status: 'approved',
    role: 'DEPUTY_COORDINATOR',
    rank: 30,
  });
  assert.ok(!defaults.LEAD.grants.includes('Registration.Create'));
  assert.ok(!defaults.LEAD.grants.includes('LostFound.CloseOut'));
});
