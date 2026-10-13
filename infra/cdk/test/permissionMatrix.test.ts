import { ACTION_CATALOGUE, EDITABLE_ACTION_IDS } from '@spoh/access-policies';
import { describe, expect, it } from 'vitest';
import { permissionCaseId, permissionFixtures, permissionInventory, policyStoreDigests,
  type PermissionFixture } from '../src/permissionMatrix.js';

const ROLES = ['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN'];
function fixture(action: string, role = 'ADMIN', context: Record<string, unknown> = {}, resource = 'E1', type = 'Event'): PermissionFixture {
  const principal = { type: 'SPOH::Membership', id: `member-${role}` };
  const roleId = { type: 'SPOH::Role', id: `E1/${role}` };
  return { request: { principal, action: { type: 'SPOH::Action', id: action },
    resource: { type: `SPOH::${type}`, id: resource }, context,
    entities: [{ uid: principal, attrs: { active: true, role: { __entity: roleId } }, parents: [] },
      { uid: roleId, attrs: { catalogueRole: role }, parents: [] }] },
  outcome: { decision: 'deny', reasons: [], errors: 0 } };
}
function completeInventory() {
  const cases = EDITABLE_ACTION_IDS.map((action) => fixture(action));
  cases.push(...ROLES.map((role) => fixture('Self.Read', role)));
  for (const action of ['Registration.Create', 'Footfall.Create', 'Card.Stamp', 'Gift.Redeem'])
    for (const eventPhase of ['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED'])
      for (const lateSyncAllowed of [false, true]) cases.push(fixture(action, 'ADMIN', { eventPhase, lateSyncAllowed }));
  cases.push(fixture('Structure.Read', 'ADMIN', {}, 'E2'));
  const inactive = fixture('Structure.Read');
  inactive.request.entities[0]!.attrs.active = false;
  cases.push(inactive);
  for (const [action, catalogue] of Object.entries(ACTION_CATALOGUE)) {
    for (const eventPhase of ['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED'])
      for (const type of catalogue.resourceTypes) {
        if ((catalogue.principalTypes as readonly string[]).includes('Membership'))
          for (const role of ROLES) cases.push(fixture(action, role, { eventPhase, lateSyncAllowed: false }, 'E1', type));
        if ((catalogue.principalTypes as readonly string[]).includes('Person'))
          for (const standing of ['platform', 'ordinary', 'inactive']) {
            const item = fixture(action, 'ADMIN', { eventPhase, lateSyncAllowed: false }, 'E1', type);
            item.request.principal = { type: 'SPOH::Person', id: `person-${standing}` };
            item.request.entities[0] = { uid: item.request.principal, parents: [],
              attrs: { active: standing !== 'inactive', platformAdmin: standing !== 'ordinary' } };
            cases.push(item);
          }
      }
  }
  return cases;
}

describe('synthetic staging permission attestation', () => {
  it('hashes and deduplicates exact request/outcome content independently of record order', () => {
    const first = fixture('Self.Read');
    const second = fixture('People.Read');
    const read = (items: PermissionFixture[]) => permissionFixtures(items.map((item) => JSON.stringify(item)).join('\n'));
    const sorted = read([first, second, first]);
    expect(sorted).toEqual(read([second, first]));
    expect(sorted).toHaveLength(2);
    expect(permissionCaseId(first)).not.toBe(permissionCaseId({ ...first, outcome: { ...first.outcome, decision: 'allow' } }));
  });

  it.each(['', '{}', JSON.stringify({ ...fixture('Self.Read'), outcome: { decision: 'allow', reasons: [], errors: 1 } }),
    JSON.stringify({ ...fixture('Self.Read'), request: { ...fixture('Self.Read').request, entities: [{}] } })])(
    'refuses incomplete or locally erroneous records', (record) => expect(() => permissionFixtures(record)).toThrow());

  it('requires six actual principal roles, every editable action and all 48 lifecycle/late-sync capture cells', () => {
    const cases = completeInventory();
    expect(permissionInventory(cases)).toMatchObject({ roles: ROLES, captureLateSyncCells: 48, count: cases.length });
    const withoutVolunteer = cases.filter((item) => !item.request.principal.id.includes('VOLUNTEER'));
    // A role merely present among other entities must not count as the evaluated principal.
    withoutVolunteer[0]!.request.entities.push(fixture('Self.Read', 'VOLUNTEER').request.entities[1]!);
    expect(() => permissionInventory(withoutVolunteer)).toThrow('lacks a role');
    expect(() => permissionInventory(cases.filter((item) => item.request.action.id !== EDITABLE_ACTION_IDS[0]))).toThrow('editable action');
    expect(() => permissionInventory(cases.filter((item) => !(item.request.action.id === 'Card.Stamp'
      && item.request.context.eventPhase === 'ARCHIVED' && item.request.context.lateSyncAllowed === true)))).toThrow('capture cell');
  });

  it('refuses a matrix with no cross-event or inactive-principal decisions', () => {
    const cases = completeInventory();
    expect(() => permissionInventory(cases.filter((item) => item.request.resource.id !== 'E2'))).toThrow('isolation');
    expect(() => permissionInventory(cases.filter((item) => item.request.entities[0]!.attrs.active !== false))).toThrow('isolation');
  });

  it('requires the current action × role × phase × applicable resource catalogue, beyond a smoke subset', () => {
    const cases = completeInventory();
    expect(permissionInventory(cases).membershipRolePhaseCells).toBeGreaterThan(2_000);
    const missing = cases.filter(({ request }) => !(request.action.id === 'Card.Void'
      && request.principal.id === 'member-VOLUNTEER' && request.context.eventPhase === 'DRAFT'));
    expect(() => permissionInventory(missing)).toThrow('action/role/phase/resource cell');
    expect(permissionInventory(cases).personStandingPhaseCells).toBeGreaterThan(100);
    const missingPerson = cases.filter(({ request }) => !(request.action.id === 'Platform.ManageAdmins'
      && request.principal.id === 'person-ordinary' && request.context.eventPhase === 'READY'));
    expect(() => permissionInventory(missingPerson)).toThrow('action/person/phase/resource cell');
  });

  it('hashes actual deployed policy text and a canonical schema without hiding whitespace drift', () => {
    const base = { schema: { b: 2, a: 1 }, policies: { second: 'forbid(principal, action, resource);', first: 'permit(principal, action, resource);' } };
    expect(policyStoreDigests(base)).toEqual(policyStoreDigests({ schema: { a: 1, b: 2 }, policies: { first: base.policies.first, second: base.policies.second } }));
    expect(policyStoreDigests(base).policyDigest).not.toBe(policyStoreDigests({ ...base, policies: { ...base.policies, first: `${base.policies.first}\n` } }).policyDigest);
  });
});
