import { Prisma } from '../../../generated/prisma/client.js';

/** Each relation is selected through the caller's exact event, in one statement snapshot. */
export const readinessCoverageRows = Prisma.sql`
  days AS (
    SELECT d.id FROM "EventDay" d JOIN selected_event e ON d."eventId" = e.id
  ), templates AS (
    SELECT t.id FROM "ShiftTemplate" t JOIN selected_event e ON t."eventId" = e.id
    WHERE t.active
  ), stations AS (
    SELECT s.id FROM "Station" s JOIN selected_event e ON s."eventId" = e.id
    JOIN "StationType" t ON t."eventId" = e.id AND t.id = s."typeId"
    WHERE s.active AND t.active
  ), shifts AS (
    SELECT s.id, s."eventDayId" AS "dayId", s."templateId"
    FROM "Shift" s JOIN selected_event e ON s."eventId" = e.id
    JOIN days d ON d.id = s."eventDayId"
    JOIN templates t ON t.id = s."templateId"
  ), memberships AS (
    SELECT m.id, m."personId", m.status, m.role
    FROM "EventMembership" m JOIN selected_event e ON m."eventId" = e.id
  ), assignments AS (
    SELECT a."shiftId", a."stationId", a."membershipId", a."volunteerId" AS "personId",
           a."eventDayId" AS "dayId"
    FROM "ShiftAssignment" a JOIN selected_event e ON a."eventId" = e.id
  )
`;

export const readinessCoverageFacts = Prisma.sql`
  jsonb_build_object(
    'dayIds', COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM days), '[]'::jsonb),
    'templateIds', COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM templates), '[]'::jsonb),
    'stationIds', COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM stations), '[]'::jsonb),
    'shifts', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM shifts s), '[]'::jsonb),
    'memberships', COALESCE((SELECT jsonb_agg(
      jsonb_build_object('id', m.id, 'personId', m."personId", 'status', m.status)
      ORDER BY m.id) FROM memberships m), '[]'::jsonb),
    'assignments', COALESCE((SELECT jsonb_agg(to_jsonb(a)
      ORDER BY a."shiftId", a."stationId", a."personId") FROM assignments a), '[]'::jsonb)
  )
`;
