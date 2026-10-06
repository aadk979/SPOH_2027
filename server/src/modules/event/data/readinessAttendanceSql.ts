import { Prisma } from '../../../generated/prisma/client.js';

export const readinessAttendanceRows = Prisma.sql`
  attendance_settings AS (
    SELECT s.key, s.value
    FROM "Setting" s JOIN selected_event e
      ON s."eventId" = e.id AND s."scopeId" = e.id
    WHERE s.scope = 'EVENT'
      AND s.key IN ('attendance.rootMembershipId', 'attendance.campusCidrs')
  ), attendance_root AS (
    SELECT m.id, m.role, m.status FROM memberships m
    WHERE m.id = (
      SELECT s.value #>> '{}' FROM attendance_settings s
      WHERE s.key = 'attendance.rootMembershipId' AND jsonb_typeof(s.value) = 'string'
    )
  )
`;

/** Raw values remain internal; application mapping uses the authored resolver and schemas. */
export const readinessAttendanceFacts = Prisma.sql`
  jsonb_build_object(
    'rootValue', (SELECT s.value FROM attendance_settings s
      WHERE s.key = 'attendance.rootMembershipId'),
    'networksValue', (SELECT s.value FROM attendance_settings s
      WHERE s.key = 'attendance.campusCidrs'),
    'root', (SELECT to_jsonb(r) FROM attendance_root r)
  )
`;
