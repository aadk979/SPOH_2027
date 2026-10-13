// The deployed verifier records these actual local Cedar decisions. Coverage follows the
// current catalogue, so a new action/resource type cannot silently escape the staging matrix.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { world, ROLES } from '../lib/bench.mjs';
import { ACTION_CATALOGUE } from '../src/generated/actions.ts';

const PHASES = ['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED'];
const entity = (type, id) => ({ __entity: { type: `SPOH::${type}`, id } });
const uid = (type, id) => ({ type: `SPOH::${type}`, id });

function resourceFor(w, action, type, principal) {
  if (type === 'Event') return entity('Event', 'E1');
  if (type === 'Organisation') return entity('Organisation', 'org');
  if (type === 'Station') return entity('Station', 'S1');
  if (type === 'EventDay') return entity('EventDay', 'D1');
  if (type === 'Membership') return action === 'Self.Read' ? principal : w.member('target', 'VOLUNTEER');
  const attrs = {
    Registration: { recordedBy: principal },
    FootfallTick: { recordedBy: principal },
    GiftRedemption: { recordedBy: principal },
    Incident: { reportedBy: principal },
    ShiftAssignment: { membership: principal, shiftRunning: true },
    SwapRequest: { requester: entity('Membership', 'm-rec'), station: entity('Station', 'S1') },
    BriefingSlot: { briefer: principal },
    Setting: { class: action === 'Settings.ManagePrivacy' ? 'privacy' :
      action === 'Settings.ManageSecurity' ? 'security' : 'operational' },
  };
  const parents = [uid('Event', 'E1')];
  if (['Registration', 'FootfallTick', 'GiftRedemption', 'ShiftAssignment'].includes(type))
    parents.push(uid('Station', 'S1'));
  return w.put(type, `matrix-${type}`, attrs[type] ?? {}, parents);
}

for (const [action, catalogue] of Object.entries(ACTION_CATALOGUE)) {
  if (catalogue.principalTypes.includes('Membership')) {
    test(`${action}: every current role, phase and applicable resource type yields a valid local decision`, () => {
      for (const role of ROLES) for (const eventPhase of PHASES) for (const type of catalogue.resourceTypes) {
        const w = world();
        const principal = w.member(`matrix-${role}`, role);
        const answer = w.can(principal, action, resourceFor(w, action, type, principal), {
          eventPhase, lateSyncAllowed: false, grantedRank: 10,
        });
        assert.ok(['allow', 'deny'].includes(answer.decision), `${role}/${eventPhase}/${type}`);
      }
    });
  }
  if (catalogue.principalTypes.includes('Person')) {
    test(`${action}: platform, ordinary and inactive people across phases yield valid local decisions`, () => {
      for (const standing of ['platform', 'ordinary', 'inactive'])
        for (const eventPhase of PHASES) for (const type of catalogue.resourceTypes) {
          const w = world();
          const principal = w.person(`matrix-${standing}`, {
            platformAdmin: standing !== 'ordinary', active: standing !== 'inactive',
          });
          const answer = w.can(principal, action, resourceFor(w, action, type, principal), {
            eventPhase, lateSyncAllowed: false, grantedRank: 10,
          });
          assert.ok(['allow', 'deny'].includes(answer.decision), `${standing}/${eventPhase}/${type}`);
          if (standing !== 'platform') assert.equal(answer.decision, 'deny');
        }
    });
  }
}
