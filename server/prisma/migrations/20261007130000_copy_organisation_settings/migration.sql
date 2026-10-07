-- P10.2 (organisation-wide settings, release B): copy the four platform-scope keys
-- from the legacy AppSetting table into the scoped Setting store, at the platform
-- scope of Event #1's organisation, with MIGRATION history (D-17).
--
-- Additive and re-runnable, with the rules of the earlier copies:
--
--   key                        disposition in this migration
--   -------------------------  ---------------------------------------------------
--   dashboardPollSeconds       COPY  -> PLATFORM scope of evt_spoh2027's organisation
--   alertPollSeconds           COPY  -> same
--   refreshSessionDays         COPY  -> same
--   idempotencyRetentionDays   COPY  -> same
--   eventName                  DEFERRED: still written by the legacy PATCH
--   every key copied by the earlier copies, and any other key
--                              not touched here
--
-- The preceding release made /admin/organisation-settings the keys' only writer
-- and was the only running task before this migration. The legacy table had one
-- row per key for the whole deployment; Event #1's organisation is the only
-- organisation that row ever governed, so the copy goes there and to no other.
-- Values are copied as stored (an invalid one falls through to the default), at
-- version 1 with the original updatedAt and updater, a null "before" and source
-- MIGRATION. A key is never copied over a row or history written since, and the
-- migration fails rather than guess when rows exist but Event #1 does not.
DO $$
DECLARE
  ev_id CONSTANT text := 'evt_spoh2027';
  copied_keys CONSTANT text[] := ARRAY[
    'dashboardPollSeconds', 'alertPollSeconds', 'refreshSessionDays', 'idempotencyRetentionDays'
  ];
  org_id text;
  source_rows integer;
  history_rows integer;
  skipped text;
BEGIN
  SELECT count(*) INTO source_rows FROM "AppSetting" WHERE "key" = ANY (copied_keys);
  IF source_rows = 0 THEN
    RAISE NOTICE 'legacy organisation settings copy: nothing to copy';
    RETURN;
  END IF;

  -- Event before Setting, the order every writer takes.
  SELECT "organisationId" INTO org_id FROM "Event" WHERE "id" = ev_id FOR SHARE;
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'legacy organisation settings copy: % legacy row(s) need copying but event % does not exist',
      source_rows, ev_id;
  END IF;

  -- Fence legacy writers for the duration of the copy; readers are unaffected.
  LOCK TABLE "AppSetting" IN SHARE MODE;

  SELECT string_agg(a."key", ', ' ORDER BY a."key") INTO skipped
  FROM "AppSetting" a
  WHERE a."key" = ANY (copied_keys)
    AND (
      EXISTS (SELECT 1 FROM "Setting" s
              WHERE s."scope" = 'PLATFORM' AND s."scopeId" = org_id AND s."key" = a."key")
      OR EXISTS (SELECT 1 FROM "SettingChange" c
                 WHERE c."scope" = 'PLATFORM' AND c."scopeId" = org_id AND c."key" = a."key")
    );

  WITH pending AS (
    SELECT a."key", a."value", a."updatedAt",
           (SELECT p."id" FROM "Person" p WHERE p."id" = a."updatedById") AS actor
    FROM "AppSetting" a
    WHERE a."key" = ANY (copied_keys)
      AND NOT EXISTS (SELECT 1 FROM "Setting" s
                      WHERE s."scope" = 'PLATFORM' AND s."scopeId" = org_id AND s."key" = a."key")
      AND NOT EXISTS (SELECT 1 FROM "SettingChange" c
                      WHERE c."scope" = 'PLATFORM' AND c."scopeId" = org_id AND c."key" = a."key")
  ), written AS (
    INSERT INTO "Setting" ("id", "scope", "scopeId", "eventId", "key", "value", "version",
                           "updatedAt", "updatedByPersonId")
    SELECT 'setmig_org_' || org_id || '_' || pending."key", 'PLATFORM'::"SettingScope", org_id, NULL,
           pending."key", pending."value", 1, pending."updatedAt", pending.actor
    FROM pending
    RETURNING "key"
  )
  INSERT INTO "SettingChange" ("id", "scope", "scopeId", "eventId", "key", "version", "before",
                               "after", "reason", "source", "actorPersonId", "createdAt")
  SELECT 'chgmig_org_' || org_id || '_' || pending."key", 'PLATFORM'::"SettingScope", org_id, NULL,
         pending."key", 1, NULL::jsonb, pending."value", 'Copied from the legacy runtime settings',
         'MIGRATION'::"SettingChangeSource", pending.actor, now()
  FROM pending
  JOIN written ON written."key" = pending."key";
  GET DIAGNOSTICS history_rows = ROW_COUNT;

  RAISE NOTICE 'legacy organisation settings copy: source rows %, copied %, skipped existing [%]',
    source_rows, history_rows, COALESCE(skipped, '');
END
$$;
