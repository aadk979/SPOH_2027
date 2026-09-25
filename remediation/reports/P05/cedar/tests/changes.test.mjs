// Every intentional change from today's model (CHANGES.md), one test each, plus the guardrails,
// station scope, lifecycle windows, attendance gate and self-service ownership.
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { world, allow } from '../lib/bench.mjs';

const S = (id) => ({ __entity: { type: 'SPOH::Station', id } });
const E = (type, id) => ({ __entity: { type: `SPOH::${type}`, id } });
const uid = (type, id) => ({ type: `SPOH::${type}`, id });
const EVENT = E('Event', 'E1');

describe('CHANGES.md', () => {
  test('C1 briefing slots: only the assigned briefer completes one (F03-016)', () => {
    const w = world();
    const briefer = w.member('briefer', 'VOLUNTEER');
    const other = w.member('other', 'VOLUNTEER');
    const slot = w.put('BriefingSlot', 'B1', { briefer }, [uid('Event', 'E1')]);
    const open = w.put('BriefingSlot', 'B2', {}, [uid('Event', 'E1')]);
    assert.ok(allow(w.can(briefer, 'Briefing.Complete', slot)));
    assert.ok(!allow(w.can(other, 'Briefing.Complete', slot)));
    assert.ok(
      !allow(w.can(other, 'Briefing.Complete', open)),
      'an unassigned slot is not anyone’s',
    );
  });

  test('C2 announcement acknowledgement: only its audience (F04-005)', () => {
    const w = world();
    const v = w.member('v', 'VOLUNTEER', { assigned: ['S1'] });
    const toAll = w.put('Announcement', 'N1', {}, [uid('Event', 'E1')]);
    const toIcs = w.put('Announcement', 'N2', { targetRole: 'IC' }, [uid('Event', 'E1')]);
    const toS2 = w.put('Announcement', 'N3', { targetStation: S('S2') }, [uid('Event', 'E1')]);
    const toS1 = w.put('Announcement', 'N4', { targetStation: S('S1') }, [uid('Event', 'E1')]);
    assert.ok(allow(w.can(v, 'Announcement.Ack', toAll)));
    assert.ok(!allow(w.can(v, 'Announcement.Ack', toIcs)));
    assert.ok(!allow(w.can(v, 'Announcement.Ack', toS2)));
    assert.ok(allow(w.can(v, 'Announcement.Ack', toS1)));
  });

  test('C3 an IC reads the roster of their own stations only (F04-004)', () => {
    const w = world();
    const ic = w.member('ic', 'IC', { assigned: ['S1'] });
    const deputy = w.member('dc', 'DEPUTY_COORDINATOR', { assigned: ['S1'] });
    assert.ok(allow(w.can(ic, 'Roster.ReadStation', S('S1'))));
    assert.ok(!allow(w.can(ic, 'Roster.ReadStation', S('S2'))));
    assert.ok(allow(w.can(deputy, 'Roster.ReadStation', S('S2'))));
  });

  test('C4 an IC sends station announcements to their own stations only (F04-024)', () => {
    const w = world();
    const ic = w.member('ic', 'IC', { assigned: ['S1'] });
    assert.ok(allow(w.can(ic, 'Announcement.SendStation', S('S1'))));
    assert.ok(!allow(w.can(ic, 'Announcement.SendStation', S('S2'))));
  });

  test('C5 role changes are their own action, and never at or above your rank (F03-001)', () => {
    const w = world();
    const deputy = w.member('dc', 'DEPUTY_COORDINATOR');
    const chief = w.member('cc', 'CHIEF_COORDINATOR');
    const admin = w.member('ad', 'ADMIN');
    const volunteer = w.member('v', 'VOLUNTEER');
    const platform = w.person('platform-admin', { platformAdmin: true });
    // The roster edit a Deputy holds no longer carries role changes.
    assert.ok(allow(w.can(deputy, 'Roster.Edit', EVENT)));
    assert.ok(!allow(w.can(deputy, 'People.AssignRole', volunteer, { grantedRank: 20 })));
    // A Chief may promote below Chief, never to Chief or above, and never themselves.
    assert.ok(allow(w.can(chief, 'People.AssignRole', volunteer, { grantedRank: 20 })));
    assert.ok(!allow(w.can(chief, 'People.AssignRole', volunteer, { grantedRank: 40 })));
    assert.ok(!allow(w.can(chief, 'People.AssignRole', volunteer, { grantedRank: 60 })));
    assert.ok(!allow(w.can(chief, 'People.AssignRole', chief, { grantedRank: 20 })));
    // Missing grantedRank is refused, not allowed.
    assert.ok(!allow(w.can(chief, 'People.AssignRole', volunteer)));
    // An event Admin cannot make another Admin; a platform admin can.
    assert.ok(!allow(w.can(admin, 'People.AssignRole', volunteer, { grantedRank: 60 })));
    assert.ok(allow(w.can(platform, 'People.AssignRole', volunteer, { grantedRank: 60 })));
  });

  test('C6 lost-and-found close-out is no longer a Lead action', () => {
    const w = world();
    assert.ok(!allow(w.can(w.member('l', 'LEAD'), 'LostFound.CloseOut', EVENT)));
    assert.ok(allow(w.can(w.member('d', 'DEPUTY_COORDINATOR'), 'LostFound.CloseOut', EVENT)));
  });

  test('C7 ICs and Leads can list stations and days (Structure.Read)', () => {
    const w = world();
    assert.ok(allow(w.can(w.member('i', 'IC'), 'Structure.Read', EVENT)));
    assert.ok(allow(w.can(w.member('l', 'LEAD'), 'Structure.Read', EVENT)));
    assert.ok(!allow(w.can(w.member('v', 'VOLUNTEER'), 'Structure.Read', EVENT)));
  });

  test('C9 privacy and security settings are platform-admin only', () => {
    const w = world();
    const setting = E('Setting', 'privacy.lostPersonPurgeHours');
    const operational = E('Setting', 'alerts.silentStationMinutes');
    const chief = w.member('cc', 'CHIEF_COORDINATOR');
    assert.ok(!allow(w.can(chief, 'Settings.ManagePrivacy', setting)));
    assert.ok(!allow(w.can(w.member('ad', 'ADMIN'), 'Settings.ManagePrivacy', setting)));
    assert.ok(
      allow(w.can(w.person('pa', { platformAdmin: true }), 'Settings.ManagePrivacy', setting)),
    );
    assert.ok(allow(w.can(chief, 'Settings.ManageEvent', operational)));
  });

  test('C11 capture follows the lifecycle, and rehearsal needs no clock tricks (ADR-004)', () => {
    const w = world();
    const v = w.member('v', 'VOLUNTEER', { assigned: ['S1', 'S2'], onShift: ['S1'] });
    const at = (station, context) => allow(w.can(v, 'Registration.Create', S(station), context));
    assert.ok(at('S1', { eventPhase: 'LIVE' }));
    assert.ok(!at('S1', { eventPhase: 'READY' }));
    assert.ok(!at('S1', { eventPhase: 'DRAFT' }));
    assert.ok(!at('S2', { eventPhase: 'LIVE' }), 'assigned but not on shift');
    assert.ok(at('S2', { eventPhase: 'REHEARSAL' }), 'assigned is enough in rehearsal');
    assert.ok(!at('S1', { eventPhase: 'CLOSED' }));
    assert.ok(at('S1', { eventPhase: 'CLOSED', lateSyncAllowed: true }));
    assert.ok(!at('S1', { eventPhase: 'ARCHIVED', lateSyncAllowed: true }));
  });

  test('C13 archiving, reopening and editing permissions are platform-admin only', () => {
    const w = world();
    for (const action of ['Event.Archive', 'Event.Reopen', 'Permissions.Edit']) {
      assert.ok(!allow(w.can(w.member('ad', 'ADMIN'), action, EVENT, { eventPhase: 'CLOSED' })));
      assert.ok(
        allow(
          w.can(w.member('pam', 'ADMIN', { platformAdmin: true }), action, EVENT, {
            eventPhase: 'CLOSED',
          }),
        ),
      );
    }
  });
});

describe('guardrails', () => {
  test('a membership never reaches another event', () => {
    const w = world();
    // Even on shift at a foreign station, with the grant: refused by guardrail.same-event.
    const v = w.member('v', 'VOLUNTEER', { assigned: ['S9'] });
    const r = w.can(v, 'Registration.Create', S('S9'));
    assert.equal(r.decision, 'deny');
    assert.ok(!allow(w.can(w.member('ad', 'ADMIN'), 'Report.Generate', E('Event', 'E2'))));
  });

  test('nobody acts on themselves or on a peer or superior', () => {
    const w = world();
    const chief = w.member('cc', 'CHIEF_COORDINATOR');
    const peer = w.member('cc2', 'CHIEF_COORDINATOR');
    const lead = w.member('l', 'LEAD');
    const ic = w.member('ic', 'IC');
    assert.ok(allow(w.can(chief, 'People.Deactivate', ic)));
    assert.ok(!allow(w.can(chief, 'People.Deactivate', chief)));
    assert.ok(!allow(w.can(chief, 'People.Deactivate', peer)));
    assert.ok(!allow(w.can(chief, 'People.Update', lead)), 'Lead outranks Chief, as today');
  });

  test('an inactive membership or person can do nothing', () => {
    const w = world();
    assert.ok(!allow(w.can(w.member('x', 'ADMIN', { active: false }), 'Report.Generate', EVENT)));
    assert.ok(
      !allow(w.can(w.member('y', 'ADMIN', { personActive: false }), 'Report.Generate', EVENT)),
    );
  });

  test('an archived event is read-only, platform admins included', () => {
    const w = world();
    const chief = w.member('cc', 'CHIEF_COORDINATOR');
    const ctx = { eventPhase: 'ARCHIVED' };
    assert.ok(allow(w.can(chief, 'Report.Generate', EVENT, ctx)));
    assert.ok(!allow(w.can(chief, 'Structure.Edit', EVENT, ctx)));
    assert.ok(!allow(w.can(w.person('pa', { platformAdmin: true }), 'Event.Reopen', EVENT, ctx)));
  });

  test('the structure is frozen once live; labels and active flags are not', () => {
    const w = world();
    const chief = w.member('cc', 'CHIEF_COORDINATOR');
    assert.ok(allow(w.can(chief, 'Structure.Change', EVENT, { eventPhase: 'DRAFT' })));
    assert.ok(!allow(w.can(chief, 'Structure.Change', EVENT, { eventPhase: 'LIVE' })));
    assert.ok(allow(w.can(chief, 'Structure.Edit', EVENT, { eventPhase: 'LIVE' })));
  });

  test('removing a grant removes the permission; guardrails cannot be granted away', () => {
    const base = world();
    const grants = JSON.parse(
      JSON.stringify(
        Object.fromEntries(
          [...base.entities.values()]
            .filter((e) => e.uid.type === 'SPOH::Role')
            .map((e) => [
              e.attrs.catalogueRole,
              { rank: e.attrs.rank, anyStation: e.attrs.anyStation, grants: e.attrs.grants },
            ]),
        ),
      ),
    );
    grants.VOLUNTEER.grants = grants.VOLUNTEER.grants.filter((a) => a !== 'Gift.Redeem');
    grants.VOLUNTEER.grants.push('People.Deactivate');
    const w = world({ grants });
    const v = w.member('v', 'VOLUNTEER');
    const other = w.member('v2', 'VOLUNTEER');
    assert.ok(!allow(w.can(v, 'Gift.Redeem', S('S1'))));
    assert.ok(
      !allow(w.can(v, 'People.Deactivate', other)),
      'granted, but a peer: the guardrail wins',
    );
  });
});

describe('station scope, attendance and self-service', () => {
  test('capture where you are on shift; IC and above anywhere', () => {
    const w = world();
    const v = w.member('v', 'VOLUNTEER', { assigned: ['S1'] });
    const ic = w.member('ic', 'IC', { assigned: ['S1'] });
    assert.ok(allow(w.can(v, 'Card.Stamp', S('S1'))));
    assert.ok(!allow(w.can(v, 'Card.Stamp', S('S2'))));
    assert.ok(allow(w.can(ic, 'Card.Stamp', S('S2'))));
  });

  test('attendance codes need verification today, or the root', () => {
    const w = world();
    const day = E('EventDay', 'D1');
    assert.ok(
      !allow(w.can(w.member('a', 'VOLUNTEER', { verified: false }), 'Attendance.IssueCode', day)),
    );
    assert.ok(
      allow(w.can(w.member('b', 'VOLUNTEER', { verified: true }), 'Attendance.IssueCode', day)),
    );
    const root = w.member('root', 'ADMIN', { verified: false, root: true });
    assert.ok(allow(w.can(root, 'Attendance.IssueCode', day)));
    const target = w.member('t', 'VOLUNTEER');
    assert.ok(allow(w.can(root, 'Attendance.MarkRoot', target)));
    assert.ok(!allow(w.can(w.member('c', 'CHIEF_COORDINATOR'), 'Attendance.MarkRoot', target)));
  });

  test('check-in: your own shift, verified today, while it runs', () => {
    const w = world();
    const v = w.member('v', 'VOLUNTEER');
    const other = w.member('o', 'VOLUNTEER');
    const running = w.put('ShiftAssignment', 'SA1', { membership: v, shiftRunning: true }, [
      uid('Station', 'S1'),
      uid('Event', 'E1'),
    ]);
    const later = w.put('ShiftAssignment', 'SA2', { membership: v, shiftRunning: false }, [
      uid('Station', 'S1'),
      uid('Event', 'E1'),
    ]);
    assert.ok(allow(w.can(v, 'Shift.CheckIn', running)));
    assert.ok(!allow(w.can(v, 'Shift.CheckIn', later)));
    assert.ok(allow(w.can(v, 'Shift.CheckIn', later, { eventPhase: 'REHEARSAL' })));
    assert.ok(!allow(w.can(other, 'Shift.CheckIn', running)));
    const unverified = w.member('u', 'VOLUNTEER', { verified: false });
    const own = w.put('ShiftAssignment', 'SA3', { membership: unverified, shiftRunning: true }, [
      uid('Station', 'S1'),
      uid('Event', 'E1'),
    ]);
    assert.ok(!allow(w.can(unverified, 'Shift.CheckIn', own)));
  });
});
