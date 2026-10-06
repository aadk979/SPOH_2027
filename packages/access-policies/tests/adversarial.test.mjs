import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DEFAULT_GRANTS, world } from '../lib/bench.mjs';
import { ACTION_CATALOGUE, EDITABLE_ACTION_IDS } from '../src/generated/actions.ts';

const entity = (type, id) => ({ __entity: { type: `SPOH::${type}`, id } });
const uid = (type, id) => ({ type: `SPOH::${type}`, id });

function foreignResource(w, type) {
  const attrs = {
    Membership: { ...w.entities.get('Membership::m-rec').attrs },
    Registration: { recordedBy: entity('Membership', 'm-rec') },
    FootfallTick: { recordedBy: entity('Membership', 'm-rec') },
    GiftRedemption: { recordedBy: entity('Membership', 'm-rec') },
    Incident: { reportedBy: entity('Membership', 'm-rec') },
    SwapRequest: { requester: entity('Membership', 'm-rec'), station: entity('Station', 'S9') },
    ShiftAssignment: { membership: entity('Membership', 'm-rec'), shiftRunning: true },
    Setting: { class: 'operational' },
  };
  if (type === 'Event') return entity('Event', 'E2');
  if (type === 'Station') return entity('Station', 'S9');
  return w.put(type, `foreign-${type}`, attrs[type] ?? {}, [uid('Event', 'E2')]);
}

test('all 46 editable actions reject a foreign resource even with every action granted', () => {
  const grants = structuredClone(DEFAULT_GRANTS);
  grants.ADMIN.grants = [...EDITABLE_ACTION_IDS];
  const w = world({ grants });
  const principal = w.member('admin', 'ADMIN', { assigned: ['S9'], platformAdmin: true });
  for (const action of EDITABLE_ACTION_IDS) {
    for (const type of ACTION_CATALOGUE[action].resourceTypes) {
      const answer = w.can(principal, action, foreignResource(w, type), { grantedRank: 10 });
      assert.equal(answer.decision, 'deny', `${action}/${type}`);
      assert.ok(answer.reasons.includes('guardrail.same-event'), `${action}/${type}`);
    }
  }
});

for (const action of ['Registration.Create', 'Footfall.Create', 'Card.Stamp', 'Gift.Redeem']) {
  test(`${action}: every lifecycle and late-sync combination preserves the capture window`, () => {
    const w = world();
    const principal = w.member('capture', 'VOLUNTEER');
    for (const eventPhase of ['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED']) {
      for (const lateSyncAllowed of [false, true]) {
        const answer = w.can(principal, action, entity('Station', 'S1'), {
          eventPhase,
          lateSyncAllowed,
        });
        const permitted =
          ['LIVE', 'REHEARSAL'].includes(eventPhase) ||
          (eventPhase === 'CLOSED' && lateSyncAllowed);
        assert.equal(
          answer.decision,
          permitted ? 'allow' : 'deny',
          `${eventPhase}/${lateSyncAllowed}`,
        );
        if (!permitted) assert.ok(answer.reasons.includes('guardrail.capture-window'));
      }
    }
  });
}

test('same-event guard overrides platform membership privileges for locked actions', () => {
  const w = world();
  const principal = w.member('platform-member', 'ADMIN', { platformAdmin: true });
  for (const action of ['Permissions.Edit', 'Event.Reopen', 'Event.Archive']) {
    const answer = w.can(principal, action, entity('Event', 'E2'), { eventPhase: 'CLOSED' });
    assert.equal(answer.decision, 'deny', action);
    assert.ok(answer.reasons.includes('guardrail.same-event'), action);
  }
});

test('deactivated platform people cannot use event or organisation privileges', () => {
  const w = world();
  const principal = w.person('inactive-platform', { platformAdmin: true, active: false });
  for (const [action, resource] of [
    ['Platform.CreateEvent', entity('Organisation', 'org')],
    ['Permissions.Edit', entity('Event', 'E1')],
  ]) {
    const answer = w.can(principal, action, resource);
    assert.equal(answer.decision, 'deny', action);
    assert.ok(answer.reasons.includes('guardrail.inactive-person'), action);
  }
});

test('granting locked names cannot create a role permit', () => {
  const grants = structuredClone(DEFAULT_GRANTS);
  grants.ADMIN.grants.push(
    'Permissions.Edit',
    'Settings.ManagePrivacy',
    'Settings.ManageSecurity',
    'Event.Reopen',
    'Event.Archive',
  );
  const w = world({ grants });
  const principal = w.member('admin', 'ADMIN');
  for (const [action, resource] of [
    ['Permissions.Edit', entity('Event', 'E1')],
    ['Settings.ManagePrivacy', entity('Setting', 'privacy.lostPersonPurgeHours')],
    ['Event.Reopen', entity('Event', 'E1')],
  ]) {
    const answer = w.can(principal, action, resource, { eventPhase: 'CLOSED' });
    assert.equal(answer.decision, 'deny', action);
    assert.ok(answer.reasons.includes('guardrail.locked-actions'), action);
  }
});
