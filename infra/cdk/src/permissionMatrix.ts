import { createHash } from 'node:crypto';
import { ACTION_CATALOGUE, EDITABLE_ACTION_IDS } from '@spoh/access-policies';
import { canonical, type StoreContents } from './avpDrift.js';

interface EntityId { type: string; id: string }
interface Entity { uid: EntityId; attrs: Record<string, unknown>; parents: EntityId[] }
export interface PermissionFixture {
  request: { principal: EntityId; action: EntityId; resource: EntityId;
    context: Record<string, unknown>; entities: Entity[] };
  outcome: { decision: 'allow' | 'deny'; reasons: string[]; errors: number };
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const ROLES = ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'];
const PHASES = ['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED'];
const CAPTURE = ['Registration.Create', 'Footfall.Create', 'Card.Stamp', 'Gift.Redeem'];

export function policyStoreDigests(store: StoreContents) {
  // Hash actual statements; drift comparison separately permits provider whitespace changes.
  return { schemaDigest: digest(store.schema), policyDigest: digest(store.policies) };
}

function isEntityId(value: unknown): value is EntityId {
  if (!value || typeof value !== 'object') return false;
  const entity = value as Partial<EntityId>;
  return typeof entity.type === 'string' && typeof entity.id === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEntity(value: unknown): value is Entity {
  if (!isRecord(value)) return false;
  return isEntityId(value.uid) && isRecord(value.attrs)
    && Array.isArray(value.parents) && value.parents.every(isEntityId);
}

/** Import only the locally passing synthetic policy-suite records, never provider/DB people. */
export function permissionFixtures(jsonLines: string): PermissionFixture[] {
  const fixtures = new Map<string, PermissionFixture>();
  for (const line of jsonLines.split('\n').filter((value) => value.trim())) {
    const value = JSON.parse(line) as PermissionFixture;
    const request = value?.request;
    if (!request || !isEntityId(request.principal) || !isEntityId(request.action)
      || !isEntityId(request.resource) || !Array.isArray(request.entities) || !request.entities.every(isEntity)
      || !isRecord(request.context)
      || !['allow', 'deny'].includes(value.outcome?.decision) || value.outcome.errors !== 0
      || !Array.isArray(value.outcome.reasons) || !value.outcome.reasons.every((reason) => typeof reason === 'string'))
      throw new Error('Invalid synthetic permission fixture');
    fixtures.set(digest(value), value);
  }
  if (fixtures.size === 0) throw new Error('No synthetic permission cases');
  return [...fixtures.values()].sort((left, right) => digest(left).localeCompare(digest(right)));
}

function same(left: EntityId, right: EntityId) { return left.type === right.type && left.id === right.id; }
function principalRole(fixture: PermissionFixture) {
  const principal = fixture.request.entities.find((entity) => same(entity.uid, fixture.request.principal));
  const role = principal?.attrs.role as { __entity?: EntityId } | undefined;
  return role?.__entity ? fixture.request.entities.find((entity) => same(entity.uid, role.__entity!))?.attrs.catalogueRole : undefined;
}

function membershipCell(fixture: PermissionFixture) {
  const { request } = fixture;
  return request.principal.type === 'SPOH::Membership' && request.context.lateSyncAllowed === false
    ? JSON.stringify([request.action.id, principalRole(fixture), request.context.eventPhase, request.resource.type]) : null;
}

function requireMembershipCells(fixtures: PermissionFixture[]) {
  const observed = new Set(fixtures.map(membershipCell).filter((value) => value !== null));
  let count = 0;
  for (const [action, catalogue] of Object.entries(ACTION_CATALOGUE)) {
    if (!(catalogue.principalTypes as readonly string[]).includes('Membership')) continue;
    for (const role of ROLES) for (const phase of PHASES) for (const type of catalogue.resourceTypes) {
      if (!observed.has(JSON.stringify([action, role, phase, `SPOH::${type}`])))
        throw new Error('Permission matrix lacks a current action/role/phase/resource cell');
      count += 1;
    }
  }
  return count;
}

function personCell(fixture: PermissionFixture) {
  const { request } = fixture;
  if (request.principal.type !== 'SPOH::Person' || request.context.lateSyncAllowed !== false) return null;
  const person = request.entities.find((entity) => same(entity.uid, request.principal));
  const standing = person?.attrs.active === false ? 'inactive'
    : person?.attrs.platformAdmin === true ? 'platform' : 'ordinary';
  return JSON.stringify([request.action.id, standing, request.context.eventPhase, request.resource.type]);
}

function requirePersonCells(fixtures: PermissionFixture[]) {
  const observed = new Set(fixtures.map(personCell).filter((value) => value !== null));
  let count = 0;
  for (const [action, catalogue] of Object.entries(ACTION_CATALOGUE)) {
    if (!(catalogue.principalTypes as readonly string[]).includes('Person')) continue;
    for (const standing of ['platform', 'ordinary', 'inactive'])
      for (const phase of PHASES) for (const type of catalogue.resourceTypes) {
        if (!observed.has(JSON.stringify([action, standing, phase, `SPOH::${type}`])))
          throw new Error('Permission matrix lacks a current action/person/phase/resource cell');
        count += 1;
      }
  }
  return count;
}

/** Fail if a future workflow accidentally replaces the declared matrix with a smoke subset. */
export function permissionInventory(fixtures: PermissionFixture[]) {
  const actions = new Set(fixtures.map((fixture) => fixture.request.action.id));
  const roles = new Set(fixtures.map(principalRole));
  for (const role of ROLES) if (!roles.has(role)) throw new Error('Permission matrix lacks a role');
  for (const action of EDITABLE_ACTION_IDS) if (!actions.has(action)) throw new Error('Permission matrix lacks an editable action');
  for (const action of CAPTURE) for (const phase of PHASES) for (const late of [false, true]) {
    if (!fixtures.some(({ request }) => request.action.id === action
      && request.context.eventPhase === phase && request.context.lateSyncAllowed === late))
      throw new Error('Permission matrix lacks a lifecycle/late-sync capture cell');
  }
  const foreign = fixtures.some(({ request }) => request.resource.id === 'E2' || request.resource.id === 'S9');
  const inactive = fixtures.some(({ request }) => request.entities.some((entity) =>
    same(entity.uid, request.principal) && entity.attrs.active === false));
  if (!foreign || !inactive) throw new Error('Permission matrix lacks event/person isolation');
  const membershipRolePhaseCells = requireMembershipCells(fixtures);
  const personStandingPhaseCells = requirePersonCells(fixtures);
  return { count: fixtures.length, caseDigest: digest(fixtures), roles: ROLES,
    phases: PHASES, actions: [...actions].sort(), membershipRolePhaseCells, personStandingPhaseCells,
    captureLateSyncCells: CAPTURE.length * PHASES.length * 2 };
}

export const permissionCaseId = (fixture: PermissionFixture) => digest(fixture);
