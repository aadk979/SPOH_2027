-- P09.5 catch-up (ADR-001 Migration): rows written after the Event #1 backfill
-- by code that did not yet write the new columns get them, from the old ones.
-- Idempotent, fills only what is null, and runs only while there is exactly one
-- event: with two, a row without an event could belong to either.
--
-- Kept here as a script (applied to local browser databases as P09.5 moves
-- module by module); it ships as a migration when the last slice lands.
DO $$
DECLARE
  ev_id text;
  tz text;
BEGIN
  IF (SELECT count(*) FROM "Event") <> 1 THEN
    RETURN;
  END IF;
  SELECT "id", "timezone" INTO ev_id, tz FROM "Event";

  -- Every row belongs to the one event.
  UPDATE "EventDay" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "Station" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "ShiftAssignment" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "Attendance" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "AttendanceChallenge" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "AttendanceAttempt" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "ShiftSwapRequest" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "BriefingSlot" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "Registration" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "FootfallTick" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "MissionCard" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "CardStampEvent" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "GiftType" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "GiftRedemption" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "GiftStockAdjustment" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "Incident" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "IncidentFollowUp" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "LostPersonAlert" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "LostPersonAck" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "LostPersonSummary" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "LostFoundItem" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "Announcement" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "AnnouncementAck" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "FallbackWindow" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "ImportBatch" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "AuditLog" SET "eventId" = ev_id WHERE "eventId" IS NULL;
  UPDATE "IdempotencyRecord" SET "eventId" = ev_id WHERE "eventId" IS NULL;

  -- A membership for everyone on the roster, mirroring their row.
  INSERT INTO "EventMembership" ("id", "eventId", "personId", "role", "portfolio", "status",
                                 "deactivatedAt", "deactivatedReason", "lastSeenAt", "updatedAt")
  SELECT gen_random_uuid()::text, ev_id, v."id", v."role", v."portfolio",
         CASE WHEN v."active" THEN 'ACTIVE' ELSE 'DEACTIVATED' END::"MembershipStatus",
         v."deactivatedAt", v."deactivatedReason", v."lastSeenAt", now()
  FROM "Volunteer" v
  ON CONFLICT ("eventId", "personId") DO NOTHING;
  UPDATE "EventMembership" m SET "reportsToId" = boss."id"
  FROM "Volunteer" v JOIN "EventMembership" boss ON boss."eventId" = ev_id AND boss."personId" = v."reportsToId"
  WHERE m."eventId" = ev_id AND m."personId" = v."id" AND m."reportsToId" IS NULL;

  -- Station types and course tags for stations made without them.
  INSERT INTO "StationType" ("id", "eventId", "code", "label", "registersVisitors", "countsEntry",
                             "issuesStamp", "redeemsGifts", "updatedAt")
  SELECT DISTINCT ON (c.type_code) gen_random_uuid()::text, ev_id, c.type_code,
         initcap(replace(lower(s."kind"::text), '_', ' ')), s."kind" = 'SIGNUP_BOOTH', s."countsEntry",
         s."issuesStamp", s."kind" = 'MISSION_COMPLETE', now()
  FROM "Station" s,
       LATERAL (SELECT s."kind"::text || CASE WHEN s."countsEntry" THEN '_COUNTED' ELSE '' END
                                     || CASE WHEN s."issuesStamp" THEN '_STAMPED' ELSE '' END AS type_code) c
  WHERE s."typeId" IS NULL
  ON CONFLICT ("eventId", "code") DO NOTHING;
  UPDATE "Station" s SET "typeId" = st."id"
  FROM "StationType" st
  WHERE s."typeId" IS NULL AND st."eventId" = ev_id
    AND st."code" = s."kind"::text || CASE WHEN s."countsEntry" THEN '_COUNTED' ELSE '' END
                                    || CASE WHEN s."issuesStamp" THEN '_STAMPED' ELSE '' END;
  INSERT INTO "StationTag" ("id", "eventId", "code", "label", "updatedAt")
  SELECT DISTINCT gen_random_uuid()::text, ev_id, s."courseCode"::text, s."courseCode"::text, now()
  FROM "Station" s WHERE s."courseCode" IS NOT NULL
  ON CONFLICT ("eventId", "code") DO NOTHING;
  INSERT INTO "StationTagging" ("eventId", "stationId", "tagId")
  SELECT ev_id, s."id", tag."id"
  FROM "Station" s JOIN "StationTag" tag ON tag."eventId" = ev_id AND tag."code" = s."courseCode"::text
  WHERE NOT EXISTS (SELECT 1 FROM "StationTagging" x WHERE x."stationId" = s."id")
  ON CONFLICT DO NOTHING;

  -- A shift per template on days made without them.
  INSERT INTO "Shift" ("id", "eventId", "eventDayId", "templateId", "startsAt", "endsAt", "updatedAt")
  SELECT gen_random_uuid()::text, ev_id, d."id", t."id",
         (d."date" + t."startLocal"::time) AT TIME ZONE tz,
         (d."date" + t."endLocal"::time + CASE WHEN t."endsNextDay" THEN interval '1 day' ELSE interval '0' END)
           AT TIME ZONE tz, now()
  FROM "EventDay" d CROSS JOIN "ShiftTemplate" t
  WHERE d."eventId" = ev_id AND t."eventId" = ev_id
  ON CONFLICT ("eventDayId", "templateId") DO NOTHING;

  -- Membership columns, through the person beside them.
  UPDATE "ShiftAssignment" x SET "membershipId" = m."id" FROM "EventMembership" m
  WHERE x."membershipId" IS NULL AND x."volunteerId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."volunteerId";
  UPDATE "Attendance" x SET "membershipId" = m."id" FROM "EventMembership" m
  WHERE x."membershipId" IS NULL AND x."volunteerId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."volunteerId";
  UPDATE "Attendance" x SET "verifiedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."verifiedByMembershipId" IS NULL AND x."verifiedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."verifiedById";
  UPDATE "AttendanceChallenge" x SET "issuerMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."issuerMembershipId" IS NULL AND x."issuerId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."issuerId";
  UPDATE "AttendanceAttempt" x SET "membershipId" = m."id" FROM "EventMembership" m
  WHERE x."membershipId" IS NULL AND x."volunteerId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."volunteerId";
  UPDATE "ShiftSwapRequest" x SET "requesterMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."requesterMembershipId" IS NULL AND x."requesterId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."requesterId";
  UPDATE "ShiftSwapRequest" x SET "targetMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."targetMembershipId" IS NULL AND x."targetId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."targetId";
  UPDATE "ShiftSwapRequest" x SET "decidedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."decidedByMembershipId" IS NULL AND x."decidedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."decidedById";
  UPDATE "BriefingSlot" x SET "briefierMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."briefierMembershipId" IS NULL AND x."briefierId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."briefierId";
  UPDATE "Registration" x SET "recordedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."recordedByMembershipId" IS NULL AND x."recordedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."recordedById";
  UPDATE "FootfallTick" x SET "recordedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."recordedByMembershipId" IS NULL AND x."recordedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."recordedById";
  UPDATE "CardStampEvent" x SET "recordedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."recordedByMembershipId" IS NULL AND x."recordedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."recordedById";
  UPDATE "GiftRedemption" x SET "recordedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."recordedByMembershipId" IS NULL AND x."recordedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."recordedById";
  UPDATE "GiftStockAdjustment" x SET "createdByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."createdByMembershipId" IS NULL AND x."createdById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."createdById";
  UPDATE "Incident" x SET "reportedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."reportedByMembershipId" IS NULL AND x."reportedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."reportedById";
  UPDATE "IncidentFollowUp" x SET "authorMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."authorMembershipId" IS NULL AND x."authorId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."authorId";
  UPDATE "LostPersonAlert" x SET "raisedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."raisedByMembershipId" IS NULL AND x."raisedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."raisedById";
  UPDATE "LostPersonAck" x SET "membershipId" = m."id" FROM "EventMembership" m
  WHERE x."membershipId" IS NULL AND x."volunteerId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."volunteerId";
  UPDATE "LostFoundItem" x SET "loggedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."loggedByMembershipId" IS NULL AND x."loggedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."loggedById";
  UPDATE "Announcement" x SET "authorMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."authorMembershipId" IS NULL AND x."authorId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."authorId";
  UPDATE "AnnouncementAck" x SET "membershipId" = m."id" FROM "EventMembership" m
  WHERE x."membershipId" IS NULL AND x."volunteerId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."volunteerId";
  UPDATE "FallbackWindow" x SET "declaredByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."declaredByMembershipId" IS NULL AND x."declaredById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."declaredById";
  UPDATE "ImportBatch" x SET "importedByMembershipId" = m."id" FROM "EventMembership" m
  WHERE x."importedByMembershipId" IS NULL AND x."importedById" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."importedById";
  UPDATE "AuditLog" x SET "membershipId" = m."id" FROM "EventMembership" m
  WHERE x."membershipId" IS NULL AND x."actorId" IS NOT NULL AND m."eventId" = ev_id AND m."personId" = x."actorId";

  -- Taxonomy ids.
  UPDATE "ShiftAssignment" a SET "shiftId" = sh."id"
  FROM "Shift" sh JOIN "ShiftTemplate" t ON t."id" = sh."templateId"
  WHERE a."shiftId" IS NULL AND sh."eventDayId" = a."eventDayId" AND t."code" = a."block"::text;
  UPDATE "Registration" r SET "categoryId" = c."id"
  FROM "CaptureCategory" c
  WHERE r."categoryId" IS NULL AND c."eventId" = ev_id AND c."code" = r."category"::text;
END
$$;
