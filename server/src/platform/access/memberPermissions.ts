import { ACTION_CATALOGUE, ACTION_IDS, type Action, type Role } from '@spoh/access-policies';
import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { systemClock } from '../time/index.js';
import {
  databaseRoleGrants,
  EntityBuilder,
  type Question,
  type ResourceRef,
} from './authorizer/index.js';
import { currentAuthorizer } from './engine.js';
import { settingQuestion } from './settingQuestion.js';
import { stationCandidates } from './stationCandidates.js';

/** Every action a member may be asked about (the person-only platform actions are not). */
const MEMBER_ACTIONS = ACTION_IDS.filter((action) =>
  (ACTION_CATALOGUE[action].principalTypes as readonly string[]).includes('Membership'),
);

/** One setting of each class stands for its class: the action depends only on the class. */
const SETTING_CLASSES = {
  operational: 'attendance.campusNetworkLabel',
  security: 'attendance.campusCidrs',
  privacy: 'lostPersonPurgeHours',
} as const;

export interface MemberPermissions {
  readonly actions: Record<string, boolean>;
  readonly settings: { operational: boolean; security: boolean; privacy: boolean };
}

const appliesTo = (action: Action, type: string) =>
  (ACTION_CATALOGUE[action].resourceTypes as readonly string[]).includes(type);

const isSelfService = (action: Action) =>
  (ACTION_CATALOGUE[action].groups as readonly string[]).includes('Self');

/**
 * The resources that answer "may they do this here at all?" (ADR-005 §6): an action on the
 * event is asked of the event; a station action of the member's stations (any of them); a
 * self-service action of their own record. An action on one record (an alert, a swap, another
 * member) has none: the role's grant in the event answers it.
 */
function resourcesFor(
  action: Action,
  context: { eventId: string; membershipId: string; stations: readonly ResourceRef[] },
): readonly ResourceRef[] {
  if (appliesTo(action, 'Event')) return [{ type: 'Event', id: context.eventId }];
  if (appliesTo(action, 'Station')) return context.stations;
  if (appliesTo(action, 'Membership') && isSelfService(action)) {
    return [{ type: 'Membership', id: context.membershipId }];
  }
  return [];
}

/**
 * What a member may do in an event, for screens: answered by the local engine from the same
 * policies the enforcement points use, never by AVP's paid batch call (ADR-005 §6). Affordance
 * only; the server still decides every request.
 */
export async function memberPermissions(
  db: PrismaTransactionClient,
  input: { scope: EventScope; membershipId: string; role: Role; ip?: string | null },
): Promise<MemberPermissions> {
  const { scope, membershipId } = input;
  const builder = new EntityBuilder(db, { eventId: scope.eventId, now: systemClock.now() });
  const stations = await stationCandidates(db, scope, membershipId);
  const granted = (await databaseRoleGrants.grantsFor(db, scope.eventId))[input.role].grants;
  const allows = async (question: Question) => {
    const request = await builder.forMembership(membershipId, {
      ...question,
      facts: { ip: input.ip ?? null },
    });
    const decision = await currentAuthorizer().isAuthorized(request);
    return decision.allowed && decision.errors.length === 0;
  };

  const actions: Record<string, boolean> = {};
  for (const action of MEMBER_ACTIONS) {
    const resources = resourcesFor(action, { eventId: scope.eventId, membershipId, stations });
    if (resources.length === 0) {
      actions[action] = isSelfService(action) || granted.includes(action);
      continue;
    }
    actions[action] = false;
    for (const resource of resources) {
      if (await allows({ action, resource })) {
        actions[action] = true;
        break;
      }
    }
  }
  const setting = (key: string) => allows(settingQuestion(key));
  return {
    actions,
    settings: {
      operational: await setting(SETTING_CLASSES.operational),
      security: await setting(SETTING_CLASSES.security),
      privacy: await setting(SETTING_CLASSES.privacy),
    },
  };
}
