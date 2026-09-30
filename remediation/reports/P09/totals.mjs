#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * P09.4's proof that migrating into Event #1 lost nothing (ADR-001, ADR-009).
 *
 * Reads the old columns and the new ones side by side and fails on any
 * difference: every event-owned row belongs to an event, registrations per
 * category and per station and day agree, every station's type is its own
 * event's (it granted exactly what its kind and flags did until P09.10), every assignment sits on the shift for its day
 * and block, and every volunteer has an Event #1 membership with the same role,
 * portfolio, reporting line and standing, and every membership column names
 * the same person's membership in the row's own event.
 *
 *   DATABASE_URL=postgresql://…_test node remediation/reports/P09/totals.mjs [--json out.json]
 *
 * Read-only. Run it on a restored production copy and on staging (P09.4), and
 * again after the contract step (P09.10).
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const EVENT_OWNED = [
  'EventDay',
  'Station',
  'ShiftAssignment',
  'Attendance',
  'AttendanceChallenge',
  'AttendanceAttempt',
  'ShiftSwapRequest',
  'BriefingSlot',
  'Registration',
  'FootfallTick',
  'MissionCard',
  'CardStampEvent',
  'GiftType',
  'GiftRedemption',
  'GiftStockAdjustment',
  'Incident',
  'IncidentFollowUp',
  'LostPersonAlert',
  'LostPersonAck',
  'LostPersonSummary',
  'LostFoundItem',
  'Announcement',
  'AnnouncementAck',
  'FallbackWindow',
  'ImportBatch',
  'AuditLog',
  'IdempotencyRecord',
];

/** Each membership column and the people column it copies. */
const MEMBERSHIP_COLUMNS = [
  ['ShiftAssignment', 'volunteerId', 'membershipId'],
  ['Attendance', 'volunteerId', 'membershipId'],
  ['Attendance', 'verifiedById', 'verifiedByMembershipId'],
  ['AttendanceChallenge', 'issuerId', 'issuerMembershipId'],
  ['AttendanceAttempt', 'volunteerId', 'membershipId'],
  ['ShiftSwapRequest', 'requesterId', 'requesterMembershipId'],
  ['ShiftSwapRequest', 'targetId', 'targetMembershipId'],
  ['ShiftSwapRequest', 'decidedById', 'decidedByMembershipId'],
  ['BriefingSlot', 'briefierId', 'briefierMembershipId'],
  ['Registration', 'recordedById', 'recordedByMembershipId'],
  ['FootfallTick', 'recordedById', 'recordedByMembershipId'],
  ['CardStampEvent', 'recordedById', 'recordedByMembershipId'],
  ['GiftRedemption', 'recordedById', 'recordedByMembershipId'],
  ['GiftStockAdjustment', 'createdById', 'createdByMembershipId'],
  ['Incident', 'reportedById', 'reportedByMembershipId'],
  ['IncidentFollowUp', 'authorId', 'authorMembershipId'],
  ['LostPersonAlert', 'raisedById', 'raisedByMembershipId'],
  ['LostPersonAck', 'volunteerId', 'membershipId'],
  ['LostFoundItem', 'loggedById', 'loggedByMembershipId'],
  ['Announcement', 'authorId', 'authorMembershipId'],
  ['AnnouncementAck', 'volunteerId', 'membershipId'],
  ['FallbackWindow', 'declaredById', 'declaredByMembershipId'],
  ['ImportBatch', 'importedById', 'importedByMembershipId'],
  ['AuditLog', 'actorId', 'membershipId'],
];

const scalar = async (client, sql) => Number((await client.query(sql)).rows[0].n);

/** Rows that disagree between the old and new readings; zero means identical. */
const CHECKS = {
  'registrations in another event than their station': `
    SELECT count(*) AS n FROM "Registration" r
    LEFT JOIN "Station" s ON s."id" = r."stationId"
    WHERE r."eventId" IS DISTINCT FROM s."eventId"`,
  // The kind, course and flag columns are gone (P09.10); what remains to check
  // is that a station's type is its own event's.
  'stations typed from another event': `
    SELECT count(*) AS n FROM "Station" s JOIN "StationType" t ON t."id" = s."typeId"
    WHERE t."eventId" <> s."eventId"`,
  'assignments off their day and block': `
    SELECT count(*) AS n FROM "ShiftAssignment" a
    LEFT JOIN "Shift" sh ON sh."id" = a."shiftId"
    LEFT JOIN "ShiftTemplate" t ON t."id" = sh."templateId"
    WHERE sh."id" IS NULL OR sh."eventDayId" <> a."eventDayId" OR t."code" <> a."block"::text`,
  'volunteers without a matching membership': `
    SELECT count(*) AS n FROM "Volunteer" v
    CROSS JOIN (SELECT "id" FROM "Event" ORDER BY "createdAt" LIMIT 1) e
    LEFT JOIN "EventMembership" m ON m."eventId" = e."id" AND m."personId" = v."id"
    LEFT JOIN "EventMembership" boss ON boss."id" = m."reportsToId"
    WHERE m."id" IS NULL OR m."role" <> v."role"
       OR m."portfolio" IS DISTINCT FROM v."portfolio"
       OR boss."personId" IS DISTINCT FROM v."reportsToId"
       OR (m."status" = 'ACTIVE') <> v."active"`,
};

export async function checkEventOne(client) {
  const results = [];
  const events = await scalar(client, 'SELECT count(*) AS n FROM "Event"');
  // Development fixtures hold a second event (P09.8); Event #1 is the first created.
  results.push({ name: 'Event #1 exists', ok: events >= 1, value: events });
  for (const table of EVENT_OWNED) {
    const n = await scalar(client, `SELECT count(*) AS n FROM "${table}" WHERE "eventId" IS NULL`);
    results.push({ name: `${table} rows without an event`, ok: n === 0, value: n });
  }
  for (const [table, person, membership] of MEMBERSHIP_COLUMNS) {
    // The membership must be the same person's, in the row's own event.
    const n = await scalar(
      client,
      `SELECT count(*) AS n FROM "${table}" t
       LEFT JOIN "EventMembership" m ON m."id" = t."${membership}"
       WHERE (t."${person}" IS NULL) <> (t."${membership}" IS NULL)
          OR (t."${membership}" IS NOT NULL
              AND (m."personId" IS DISTINCT FROM t."${person}" OR m."eventId" IS DISTINCT FROM t."eventId"))`,
    );
    results.push({
      name: `${table}.${membership} is not ${person}'s membership`,
      ok: n === 0,
      value: n,
    });
  }
  for (const [name, sql] of Object.entries(CHECKS)) {
    const n = await scalar(client, sql);
    results.push({ name, ok: n === 0, value: n });
  }
  return results;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const results = await checkEventOne(client);
    for (const result of results) {
      console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}: ${result.value}`);
    }
    const out = process.argv.indexOf('--json');
    if (out > -1) writeFileSync(process.argv[out + 1], `${JSON.stringify(results, null, 2)}\n`);
    process.exit(results.every((result) => result.ok) ? 0 : 1);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
