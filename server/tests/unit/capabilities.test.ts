import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_MATRIX,
  Capability,
  capabilitiesForRole,
  highestRole,
  roleHasCapability,
  roleMeets,
  type CommitteeRole,
} from '@spoh/shared';

/**
 * The capability matrix from BUILD_PLAN §6.3, transcribed independently here.
 *
 * This is deliberately a second copy rather than an import of the production
 * table: a test that read the same data it is checking would pass no matter
 * what that data said. Every cell below was read off the plan by hand, and a
 * divergence between the two copies is exactly what this is meant to catch.
 *
 * Column order: Volunteer, IC, DC, Chief, Lead, Admin.
 */
const ROLES = [
  'VOLUNTEER',
  'IC',
  'DEPUTY_COORDINATOR',
  'CHIEF_COORDINATOR',
  'LEAD',
  'ADMIN',
] as const satisfies readonly CommitteeRole[];

type Row = [boolean, boolean, boolean, boolean, boolean, boolean];

// prettier-ignore
const EXPECTED: Record<Capability, Row> = {
  //                            V      IC     DC     Chief  Lead   Admin
  'registration.create':       [true,  true,  true,  true,  false, true],
  'footfall.create':           [true,  true,  true,  true,  false, true],
  'card.stamp':                [true,  true,  true,  true,  false, true],
  'gift.redeem':               [true,  true,  true,  true,  false, true],
  'record.void':               [false, true,  true,  true,  false, true],
  'count.adjust':              [false, true,  true,  true,  false, true],
  'card.reissue':              [false, true,  true,  true,  false, true],
  'incident.report':           [true,  true,  true,  true,  true,  true],
  'incident.resolve':          [false, true,  true,  true,  false, true],
  'lostPerson.raise':          [true,  true,  true,  true,  true,  true],
  'lostPerson.resolve':        [false, true,  true,  true,  false, true],
  'lostFound.log':             [true,  true,  true,  true,  false, true],
  'own.read':                  [true,  true,  true,  true,  true,  true],
  'dashboard.station.read':    [false, true,  true,  true,  true,  true],
  'dashboard.event.read':      [false, false, true,  true,  true,  true],
  'swap.approve':              [false, true,  true,  true,  false, true],
  'roster.edit':               [false, false, true,  true,  false, true],
  'announcement.station.send': [false, true,  true,  true,  false, true],
  'announcement.event.send':   [false, false, true,  true,  false, true],
  'fallback.declare':          [false, false, true,  true,  false, true],
  'fallback.import':           [false, false, false, true,  false, true],
  'report.generate':           [false, false, true,  true,  true,  true],
  // Reading the roster is a wider grant than changing it: a DC runs their own
  // portfolio's people, and a Lead needs the list to write the report.
  'user.read':                 [false, false, true,  true,  true,  true],
  'user.provision':            [false, false, false, true,  false, true],
  // Stations, event days, gift types and the runtime tuning values. Narrower
  // than roster.edit because moving a shift boundary silently re-scopes every
  // capture permission in the system.
  'config.manage':             [false, false, false, true,  false, true],
  'audit.read':                [false, false, false, true,  true,  true],
};

describe('capability matrix (BUILD_PLAN §6.3)', () => {
  it('covers every declared capability', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...Capability.options].sort());
  });

  for (const capability of Capability.options) {
    describe(capability, () => {
      ROLES.forEach((role, index) => {
        const allowed = EXPECTED[capability][index];

        it(`${allowed ? 'grants' : 'denies'} ${role}`, () => {
          expect(roleHasCapability(role, capability)).toBe(allowed);
        });
      });
    });
  }

  it('lists exactly the granted capabilities for a role', () => {
    const index = ROLES.indexOf('VOLUNTEER');
    const expected = Capability.options.filter((cap) => EXPECTED[cap][index]);
    expect([...capabilitiesForRole('VOLUNTEER')].sort()).toEqual([...expected].sort());
  });

  it('never grants a role the matrix does not list', () => {
    for (const [capability, roles] of Object.entries(CAPABILITY_MATRIX)) {
      for (const role of roles) {
        expect(ROLES).toContain(role);
        expect(EXPECTED[capability as Capability][ROLES.indexOf(role)]).toBe(true);
      }
    }
  });
});

describe('role precedence is not a substitute for capabilities', () => {
  /**
   * The trap the matrix exists to avoid. Lead outranks Volunteer, so middleware
   * asking "is the caller at least a Volunteer?" would let a Lead create
   * registrations — which the plan explicitly forbids.
   */
  it('ranks Lead above Volunteer', () => {
    expect(roleMeets('LEAD', 'VOLUNTEER')).toBe(true);
  });

  it('still denies Lead the capability to create a registration', () => {
    expect(roleHasCapability('LEAD', 'registration.create')).toBe(false);
  });

  it('picks the most privileged of several groups', () => {
    expect(highestRole(['VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR'])).toBe('DEPUTY_COORDINATOR');
    expect(highestRole([])).toBeUndefined();
  });
});
