/**
 * A small harness for evaluating the draft policies locally with Cedar WASM: the same engine
 * the LocalCedarAuthorizer uses (ADR-005 §6). It loads every policies/*.cedar file, keys each
 * policy by its @id annotation, and builds entities for a two-event world.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { schemaText } from './catalogue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_GRANTS = JSON.parse(readFileSync(join(ROOT, 'default-grants.json'), 'utf8'));
export const ROLES = [
  'VOLUNTEER',
  'IC',
  'DEPUTY_COORDINATOR',
  'CHIEF_COORDINATOR',
  'LEAD',
  'ADMIN',
];

/** Every policy in policies/, keyed by its @id. */
export function loadPolicies() {
  const policies = {};
  for (const file of readdirSync(join(ROOT, 'policies')).filter((f) => f.endsWith('.cedar'))) {
    const parts = cedar.policySetTextToParts(readFileSync(join(ROOT, 'policies', file), 'utf8'));
    if (parts.type !== 'success') throw new Error(`${file}: ${JSON.stringify(parts.errors)}`);
    for (const text of parts.policies) {
      const id = text.match(/@id\("([^"]+)"\)/)?.[1];
      if (!id) throw new Error(`${file}: a policy has no @id`);
      if (policies[id]) throw new Error(`duplicate policy id ${id}`);
      policies[id] = text;
    }
  }
  return policies;
}

const ref = (type, id) => ({ __entity: { type: `SPOH::${type}`, id } });
const uid = (type, id) => ({ type: `SPOH::${type}`, id });

/**
 * Two events (E1, E2) in one organisation. E1 has stations S1 and S2 and day D1; E2 has S9.
 * Roles in E1 carry the default grants unless a test overrides them.
 */
export function world({ grants = DEFAULT_GRANTS } = {}) {
  const entities = new Map();
  const put = (type, id, attrs = {}, parents = []) => {
    entities.set(`${type}::${id}`, { uid: uid(type, id), attrs, parents });
    return ref(type, id);
  };

  put('Organisation', 'org');
  for (const event of ['E1', 'E2']) put('Event', event, {}, [uid('Organisation', 'org')]);
  put('EventDay', 'D1', {}, [uid('Event', 'E1')]);
  for (const station of ['S1', 'S2']) put('Station', station, {}, [uid('Event', 'E1')]);
  put('Station', 'S9', {}, [uid('Event', 'E2')]);
  for (const role of ROLES) {
    const g = grants[role];
    put(
      'Role',
      `E1/${role}`,
      {
        catalogueRole: role,
        rank: g.rank,
        grants: [...g.grants],
        anyStation: g.anyStation,
      },
      [uid('Event', 'E1')],
    );
  }

  const api = {
    entities,
    put,
    /** A person, optionally a platform admin. */
    person(id, { platformAdmin = false, active = true } = {}) {
      return put('Person', id, { active, platformAdmin });
    },
    /** A membership of E1 holding `role`, assigned and on shift at `stations`. */
    member(id, role, opts = {}) {
      const {
        assigned = ['S1'],
        onShift = assigned,
        verified = true,
        root = false,
        active = true,
        personActive = true,
        platformAdmin = false,
        event = 'E1',
      } = opts;
      api.person(`P-${id}`, { platformAdmin, active: personActive });
      return put(
        'Membership',
        id,
        {
          event: ref('Event', event),
          person: ref('Person', `P-${id}`),
          role: ref('Role', `E1/${role}`),
          rank: grants[role].rank,
          active,
          assignedStations: assigned.map((s) => ref('Station', s)),
          onShiftStations: onShift.map((s) => ref('Station', s)),
          workingDays: [ref('EventDay', 'D1')],
          attendanceVerifiedToday: verified,
          isAttendanceRoot: root,
        },
        [uid('Event', event)],
      );
    },
    /** Evaluate one request. Returns { decision, reasons, errors }. */
    can(principal, action, resource, context = {}) {
      const answer = cedar.isAuthorized({
        principal: principal.__entity,
        action: { type: 'SPOH::Action', id: action },
        resource: resource.__entity,
        context: { eventPhase: 'LIVE', lateSyncAllowed: false, onTrustedNetwork: true, ...context },
        schema: schemaText(),
        validateRequest: true,
        policies: { staticPolicies: POLICIES },
        entities: [...entities.values()],
      });
      if (answer.type !== 'success') throw new Error(JSON.stringify(answer.errors));
      const { decision, diagnostics } = answer.response;
      if (diagnostics.errors.length > 0) throw new Error(JSON.stringify(diagnostics.errors));
      return { decision, reasons: diagnostics.reason };
    },
  };

  // Resources used across the tests.
  put('Registration', 'R1', { recordedBy: api.member('m-rec', 'VOLUNTEER') }, [
    uid('Station', 'S1'),
    uid('Event', 'E1'),
  ]);
  put('MissionCard', 'C1', {}, [uid('Event', 'E1')]);
  put('Incident', 'I1', { reportedBy: ref('Membership', 'm-rec') }, [uid('Event', 'E1')]);
  put('LostPersonAlert', 'A1', {}, [uid('Event', 'E1')]);
  put(
    'SwapRequest',
    'W1',
    {
      requester: ref('Membership', 'm-rec'),
      station: ref('Station', 'S1'),
    },
    [uid('Event', 'E1')],
  );
  put('Setting', 'privacy.lostPersonPurgeHours', { class: 'privacy' }, [uid('Event', 'E1')]);
  put('Setting', 'alerts.silentStationMinutes', { class: 'operational' }, [uid('Event', 'E1')]);
  return api;
}

export const POLICIES = loadPolicies();
export const allow = (r) => r.decision === 'allow';
