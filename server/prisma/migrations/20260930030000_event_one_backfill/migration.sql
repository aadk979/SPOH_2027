-- P09.4, migrate (ADR-001 Migration step 2; D-12 = migrate): today's data
-- becomes Event #1, "SPOH 2027".
--
-- One idempotent block:
--   * the organisation, from today's hardcoded identity (F01-003, F01-004),
--     always, so a fresh database has somewhere to create events;
--   * Event #1 and everything below it only when there is data to migrate and
--     no event yet, so it runs once and never on an empty database;
--   * taxonomy from today's enums: a capture category per VisitorCategory, a
--     station type per (kind, countsEntry, issuesStamp) in use (capabilities live
--     on the type, ADR-002), a tag per course, shift templates from the
--     configured hours and a materialised shift per day and template;
--   * a membership per volunteer carrying the volunteer's own id, so every
--     membership column is a copy of the people column beside it;
--   * eventId on every existing row.
--
-- The old columns stay authoritative until P09.5. remediation/reports/P09/totals.mjs
-- proves the counts per category, station and day are identical through the
-- new columns. Reversible until P09.10: clear the new columns, delete the rows
-- this block created.
DO $$
DECLARE
  org_id CONSTANT text := 'org_sp_school_of_computing';
  ev_id CONSTANT text := 'evt_spoh2027';
  tz CONSTANT text := 'Asia/Singapore';
  blocks jsonb;
BEGIN
  INSERT INTO "Organisation" ("id", "slug", "name", "appName", "locale", "defaultTimezone", "updatedAt")
  VALUES (org_id, 'sp-school-of-computing', 'Singapore Polytechnic School of Computing', 'SPOH Ops', 'en-SG', tz, now())
  ON CONFLICT ("id") DO NOTHING;

  IF EXISTS (SELECT 1 FROM "Event") THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Volunteer") AND NOT EXISTS (SELECT 1 FROM "EventDay")
     AND NOT EXISTS (SELECT 1 FROM "Station") THEN
    RETURN;
  END IF;

  INSERT INTO "Event" ("id", "organisationId", "slug", "name", "venue", "timezone", "locale", "status",
                       "dayBoundaryMinutes", "updatedAt")
  VALUES (ev_id, org_id, 'spoh2027',
          COALESCE((SELECT "value" #>> '{}' FROM "AppSetting" WHERE "key" = 'eventName'), 'SPOH 2027'),
          'Singapore Polytechnic, T19', tz, 'en-SG', 'READY', 0, now());

  -- Capture categories, in the booth's order, with its labels.
  INSERT INTO "CaptureCategory" ("id", "eventId", "code", "label", "sortOrder", "updatedAt")
  SELECT gen_random_uuid()::text, ev_id, c.code, c.label, c.ord, now()
  FROM (VALUES ('SEC_1', 'Sec 1', 1), ('SEC_2', 'Sec 2', 2), ('SEC_3', 'Sec 3', 3), ('SEC_4', 'Sec 4', 4),
               ('SEC_5', 'Sec 5', 5), ('GRADUATED_AWAITING_RESULTS', 'Graduated, awaiting results', 6),
               ('PARENT_GUARDIAN', 'Parent / Guardian', 7), ('OTHER', 'Other', 8)) AS c(code, label, ord);

  -- Station types: one per combination in use. The kind decides registration
  -- and redemption, the station flags counting and stamping (F01 § P01.3).
  INSERT INTO "StationType" ("id", "eventId", "code", "label", "registersVisitors", "countsEntry",
                             "issuesStamp", "redeemsGifts", "sortOrder", "updatedAt")
  SELECT gen_random_uuid()::text, ev_id,
         t.kind::text || CASE WHEN t."countsEntry" THEN '_COUNTED' ELSE '' END
                      || CASE WHEN t."issuesStamp" THEN '_STAMPED' ELSE '' END,
         initcap(replace(lower(t.kind::text), '_', ' '))
           || CASE WHEN t."countsEntry" AND t."issuesStamp" THEN ' (counted, stamps)'
                   WHEN t."countsEntry" THEN ' (counted)'
                   WHEN t."issuesStamp" THEN ' (stamps)' ELSE '' END,
         t.kind = 'SIGNUP_BOOTH', t."countsEntry", t."issuesStamp", t.kind = 'MISSION_COMPLETE',
         row_number() OVER (ORDER BY t.kind, t."countsEntry", t."issuesStamp"), now()
  FROM (SELECT DISTINCT "kind" AS kind, "countsEntry", "issuesStamp" FROM "Station") AS t;

  UPDATE "Station" s SET "typeId" = st."id"
  FROM "StationType" st
  WHERE st."eventId" = ev_id
    AND st."code" = s."kind"::text || CASE WHEN s."countsEntry" THEN '_COUNTED' ELSE '' END
                                    || CASE WHEN s."issuesStamp" THEN '_STAMPED' ELSE '' END;

  -- Courses become tags.
  INSERT INTO "StationTag" ("id", "eventId", "code", "label", "updatedAt")
  SELECT gen_random_uuid()::text, ev_id, c.code, c.label, now()
  FROM (VALUES ('DCITP', 'Diploma in Infocomm Security Management'),
               ('DAAA', 'Diploma in Applied AI & Analytics'),
               ('DCDF', 'Diploma in Computer Engineering / Digital Forensics'),
               ('DCS', 'Diploma in Computer Science')) AS c(code, label);
  INSERT INTO "StationTagging" ("eventId", "stationId", "tagId")
  SELECT ev_id, s."id", tag."id"
  FROM "Station" s JOIN "StationTag" tag ON tag."eventId" = ev_id AND tag."code" = s."courseCode"::text
  WHERE s."courseCode" IS NOT NULL;

  -- Shift templates from the configured hours, else the compiled defaults.
  blocks := COALESCE((SELECT "value" FROM "AppSetting" WHERE "key" = 'shiftBlocks'),
                     '{"MORNING":{"start":"09:30","end":"14:00"},"AFTERNOON":{"start":"13:30","end":"18:00"}}'::jsonb);
  INSERT INTO "ShiftTemplate" ("id", "eventId", "code", "label", "startLocal", "endLocal", "sortOrder", "updatedAt")
  SELECT gen_random_uuid()::text, ev_id, b.code, b.label,
         COALESCE(blocks #>> ARRAY[b.code, 'start'], b.start_default),
         COALESCE(blocks #>> ARRAY[b.code, 'end'], b.end_default), b.ord, now()
  FROM (VALUES ('MORNING', 'Morning', '09:30', '14:00', 1),
               ('AFTERNOON', 'Afternoon', '13:30', '18:00', 2)) AS b(code, label, start_default, end_default, ord);

  UPDATE "EventDay" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  INSERT INTO "Shift" ("id", "eventId", "eventDayId", "templateId", "startsAt", "endsAt", "updatedAt")
  SELECT gen_random_uuid()::text, ev_id, d."id", t."id",
         (d."date" + t."startLocal"::time) AT TIME ZONE tz,
         (d."date" + t."endLocal"::time) AT TIME ZONE tz, now()
  FROM "EventDay" d CROSS JOIN "ShiftTemplate" t
  WHERE d."eventId" = ev_id AND t."eventId" = ev_id;

  -- People: an organisation membership each, and an Event #1 membership with
  -- the volunteer's own id, role, portfolio, reporting line and standing.
  INSERT INTO "OrganisationMembership" ("id", "organisationId", "personId", "role", "updatedAt")
  SELECT gen_random_uuid()::text, org_id, v."id",
         CASE WHEN v."role" = 'ADMIN' THEN 'PLATFORM_ADMIN' ELSE 'MEMBER' END::"OrganisationRole", now()
  FROM "Volunteer" v;
  INSERT INTO "EventMembership" ("id", "eventId", "personId", "role", "portfolio", "status",
                                 "deactivatedAt", "deactivatedReason", "lastSeenAt", "createdAt", "updatedAt")
  SELECT v."id", ev_id, v."id", v."role", v."portfolio",
         CASE WHEN v."active" THEN 'ACTIVE' ELSE 'DEACTIVATED' END::"MembershipStatus",
         v."deactivatedAt", v."deactivatedReason", v."lastSeenAt", v."createdAt", now()
  FROM "Volunteer" v;
  UPDATE "EventMembership" m SET "reportsToId" = v."reportsToId"
  FROM "Volunteer" v WHERE m."id" = v."id" AND v."reportsToId" IS NOT NULL;

  -- Every existing row belongs to Event #1, with its membership and taxonomy ids.
  UPDATE "Station" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "ShiftAssignment" SET "eventId" = ev_id, "membershipId" = "volunteerId";
  UPDATE "ShiftAssignment" a SET "shiftId" = sh."id"
  FROM "Shift" sh JOIN "ShiftTemplate" t ON t."id" = sh."templateId"
  WHERE sh."eventDayId" = a."eventDayId" AND t."code" = a."block"::text;
  UPDATE "Attendance" SET "eventId" = ev_id, "membershipId" = "volunteerId", "verifiedByMembershipId" = "verifiedById";
  UPDATE "AttendanceChallenge" SET "eventId" = ev_id, "issuerMembershipId" = "issuerId";
  UPDATE "AttendanceAttempt" SET "eventId" = ev_id, "membershipId" = "volunteerId";
  UPDATE "ShiftSwapRequest" SET "eventId" = ev_id, "requesterMembershipId" = "requesterId",
         "targetMembershipId" = "targetId", "decidedByMembershipId" = "decidedById";
  UPDATE "BriefingSlot" SET "eventId" = ev_id, "briefierMembershipId" = "briefierId";
  UPDATE "Registration" SET "eventId" = ev_id, "recordedByMembershipId" = "recordedById";
  UPDATE "Registration" r SET "categoryId" = c."id"
  FROM "CaptureCategory" c WHERE c."eventId" = ev_id AND c."code" = r."category"::text;
  UPDATE "FootfallTick" SET "eventId" = ev_id, "recordedByMembershipId" = "recordedById";
  UPDATE "MissionCard" SET "eventId" = ev_id;
  UPDATE "CardStampEvent" SET "eventId" = ev_id, "recordedByMembershipId" = "recordedById";
  UPDATE "GiftType" SET "eventId" = ev_id;
  UPDATE "GiftRedemption" SET "eventId" = ev_id, "recordedByMembershipId" = "recordedById";
  UPDATE "GiftStockAdjustment" SET "eventId" = ev_id, "createdByMembershipId" = "createdById";
  UPDATE "Incident" SET "eventId" = ev_id, "reportedByMembershipId" = "reportedById";
  UPDATE "IncidentFollowUp" SET "eventId" = ev_id, "authorMembershipId" = "authorId";
  UPDATE "LostPersonAlert" SET "eventId" = ev_id, "raisedByMembershipId" = "raisedById";
  UPDATE "LostPersonAck" SET "eventId" = ev_id, "membershipId" = "volunteerId";
  UPDATE "LostPersonSummary" SET "eventId" = ev_id;
  UPDATE "LostFoundItem" SET "eventId" = ev_id, "loggedByMembershipId" = "loggedById";
  UPDATE "Announcement" SET "eventId" = ev_id, "authorMembershipId" = "authorId";
  UPDATE "AnnouncementAck" SET "eventId" = ev_id, "membershipId" = "volunteerId";
  UPDATE "FallbackWindow" SET "eventId" = ev_id, "declaredByMembershipId" = "declaredById";
  UPDATE "ImportBatch" SET "eventId" = ev_id, "importedByMembershipId" = "importedById";
  -- Everything audited so far happened in the one event there was.
  UPDATE "AuditLog" SET "eventId" = ev_id, "membershipId" = "actorId";
  UPDATE "IdempotencyRecord" SET "eventId" = ev_id;
END
$$;
