// The 26 × 6 port (ADR-005 §5): with the default grants, each of today's capabilities, mapped
// to its primary Cedar action, allows exactly the roles packages/shared/src/capabilities.ts
// allows. The matrix is read from that file, so this test fails if either side drifts. Cells
// that change on purpose are tested in changes.test.mjs, never here.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { world, allow, ROLES } from '../lib/bench.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const LETTER = {
  V: 'VOLUNTEER',
  I: 'IC',
  D: 'DEPUTY_COORDINATOR',
  C: 'CHIEF_COORDINATOR',
  L: 'LEAD',
  A: 'ADMIN',
};

function currentMatrix() {
  const text = readFileSync(join(REPO, 'packages', 'shared', 'src', 'capabilities.ts'), 'utf8');
  const matrix = {};
  for (const m of text.matchAll(/^\s*'([a-zA-Z.]+)': \[([A-Z, ]*)\],$/gm)) {
    matrix[m[1]] = m[2]
      .split(',')
      .map((s) => LETTER[s.trim()])
      .filter(Boolean);
  }
  return matrix;
}

const S = (id) => ({ __entity: { type: 'SPOH::Station', id } });
const E = (type, id) => ({ __entity: { type: `SPOH::${type}`, id } });

// capability → [primary action, resource(world, principal)]
const MAPPING = {
  'registration.create': ['Registration.Create', () => S('S1')],
  'footfall.create': ['Footfall.Create', () => S('S1')],
  'card.stamp': ['Card.Stamp', () => S('S1')],
  'gift.redeem': ['Gift.Redeem', () => S('S1')],
  'record.void': ['Record.Void', () => E('Registration', 'R1')],
  'count.adjust': ['Count.Adjust', () => S('S1')],
  'card.reissue': ['Card.Reissue', () => E('MissionCard', 'C1')],
  'incident.report': ['Incident.Report', () => E('Event', 'E1')],
  'incident.resolve': ['Incident.Update', () => E('Incident', 'I1')],
  'lostPerson.raise': ['LostPerson.Raise', () => E('Event', 'E1')],
  'lostPerson.resolve': ['LostPerson.Resolve', () => E('LostPersonAlert', 'A1')],
  'lostFound.log': ['LostFound.Log', () => E('Event', 'E1')],
  'own.read': ['Self.Read', (_w, me) => me],
  'dashboard.station.read': ['Dashboard.ReadStation', () => S('S1')],
  'dashboard.event.read': ['Dashboard.ReadEvent', () => E('Event', 'E1')],
  'swap.approve': ['Swap.Decide', () => E('SwapRequest', 'W1')],
  'roster.edit': ['Roster.Edit', () => E('Event', 'E1')],
  'announcement.station.send': ['Announcement.SendStation', () => S('S1')],
  'announcement.event.send': ['Announcement.SendEvent', () => E('Event', 'E1')],
  'fallback.declare': ['Fallback.Declare', () => E('Event', 'E1')],
  'fallback.import': ['Fallback.Import', () => E('Event', 'E1')],
  'report.generate': ['Report.Generate', () => E('Event', 'E1')],
  'user.read': ['People.Read', () => E('Event', 'E1')],
  'user.provision': ['People.Update', (w) => w.member('target-volunteer', 'VOLUNTEER')],
  'config.manage': ['Structure.Edit', () => E('Event', 'E1')],
  'audit.read': ['Audit.Read', () => E('Event', 'E1')],
};

const matrix = currentMatrix();

test('the mapping covers all 26 capabilities in capabilities.ts', () => {
  assert.equal(Object.keys(matrix).length, 26);
  assert.deepEqual(Object.keys(MAPPING).sort(), Object.keys(matrix).sort());
});

for (const [capability, [action, resourceFor]] of Object.entries(MAPPING)) {
  test(`${capability} → ${action}: same six cells as today`, () => {
    const w = world();
    const cells = ROLES.map((role) => {
      const me = w.member(`m-${role}`, role);
      return [role, allow(w.can(me, action, resourceFor(w, me)))];
    });
    const allowed = cells
      .filter(([, ok]) => ok)
      .map(([role]) => role)
      .sort();
    assert.deepEqual(allowed, [...matrix[capability]].sort());
  });
}
