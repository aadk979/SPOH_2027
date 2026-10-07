-- P10.2 (lost-person retention, release B): copy lostPersonPurgeHours from the
-- legacy AppSetting table into the scoped Setting store, with MIGRATION history.
--
-- Additive and re-runnable, with the same rules as
-- 20261007090000_copy_capture_settings, for one key:
--
--   key                        disposition in this migration
--   -------------------------  ---------------------------------------------------
--   lostPersonPurgeHours       COPY  -> EVENT scope of Event #1 (evt_spoh2027)
--   eventName, idempotencyRetentionDays, refreshSessionDays, dashboardPollSeconds,
--   alertPollSeconds           DEFERRED: still written by the legacy PATCH
--   every key copied by the earlier copies, and any other key
--                              not touched here
--
-- The preceding compatibility release made the event settings the key's only
-- writer and capped it at 24 hours (D-16), and was the only running task before
-- this migration. The value is copied as stored: a legacy value above 24 hours
-- is kept as evidence, and the resolver falls through it to the 24-hour default,
-- so no event keeps a description longer than the promise. Version 1, the
-- original updatedAt and updater, null "before", source MIGRATION; never
-- overwrites a row or reset history written since; fails rather than guess a
-- destination when rows exist but Event #1 does not.
DO $$
DECLARE
  ev_id CONSTANT text := 'evt_spoh2027';
  copied_keys CONSTANT text[] := ARRAY['lostPersonPurgeHours'];
  known_keys CONSTANT text[] := ARRAY[
    'silentStationMinutes', 'staleDeviceMinutes', 'implausibleTapsPerMinute', 'longShiftMinutes',
    'captureUndoWindowSeconds', 'captureSendGraceSeconds', 'outboxWarningCount',
    'outboxWarningAgeMinutes', 'eventName', 'idempotencyRetentionDays', 'refreshSessionDays',
    'dashboardPollSeconds', 'alertPollSeconds'
  ];
  source_rows integer;
  inserted_rows integer;
  history_rows integer;
  skipped text;
  known_rows integer;
  other_rows integer;
BEGIN
  SELECT count(*) INTO source_rows FROM "AppSetting" WHERE "key" = ANY (copied_keys);
  SELECT count(*) INTO known_rows FROM "AppSetting" WHERE "key" = ANY (known_keys);
  SELECT count(*) INTO other_rows FROM "AppSetting"
    WHERE NOT ("key" = ANY (copied_keys)) AND NOT ("key" = ANY (known_keys));

  IF source_rows = 0 THEN
    RAISE NOTICE 'legacy retention copy: nothing to copy (other known rows %, other rows %)',
      known_rows, other_rows;
    RETURN;
  END IF;

  -- Serialise with catalogue writes on the same event (Event before Setting).
  PERFORM 1 FROM "Event" WHERE "id" = ev_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'legacy retention copy: % legacy row(s) need copying but event % does not exist',
      source_rows, ev_id;
  END IF;

  -- Fence legacy writers for the duration of the copy; readers are unaffected.
  LOCK TABLE "AppSetting" IN SHARE MODE;

  SELECT string_agg(a."key", ', ' ORDER BY a."key") INTO skipped
  FROM "AppSetting" a
  WHERE a."key" = ANY (copied_keys)
    AND (
      EXISTS (SELECT 1 FROM "Setting" s
              WHERE s."scope" = 'EVENT' AND s."scopeId" = ev_id AND s."key" = a."key")
      OR EXISTS (SELECT 1 FROM "SettingChange" c
                 WHERE c."scope" = 'EVENT' AND c."scopeId" = ev_id AND c."key" = a."key")
    );

  WITH pending AS (
    SELECT a."key", a."value", a."updatedAt",
           (SELECT p."id" FROM "Person" p WHERE p."id" = a."updatedById") AS actor
    FROM "AppSetting" a
    WHERE a."key" = ANY (copied_keys)
      AND NOT EXISTS (SELECT 1 FROM "Setting" s
                      WHERE s."scope" = 'EVENT' AND s."scopeId" = ev_id AND s."key" = a."key")
      AND NOT EXISTS (SELECT 1 FROM "SettingChange" c
                      WHERE c."scope" = 'EVENT' AND c."scopeId" = ev_id AND c."key" = a."key")
  ), written AS (
    INSERT INTO "Setting" ("id", "scope", "scopeId", "eventId", "key", "value", "version",
                           "updatedAt", "updatedByPersonId")
    SELECT 'setmig_' || ev_id || '_' || pending."key", 'EVENT'::"SettingScope", ev_id, ev_id, pending."key",
           pending."value", 1, pending."updatedAt", pending.actor
    FROM pending
    RETURNING "key"
  )
  INSERT INTO "SettingChange" ("id", "scope", "scopeId", "eventId", "key", "version", "before",
                               "after", "reason", "source", "actorPersonId", "createdAt")
  SELECT 'chgmig_' || ev_id || '_' || pending."key", 'EVENT'::"SettingScope", ev_id, ev_id, pending."key", 1, NULL::jsonb,
         pending."value", 'Copied from the legacy runtime settings', 'MIGRATION'::"SettingChangeSource", pending.actor,
         now()
  FROM pending
  JOIN written ON written."key" = pending."key";
  GET DIAGNOSTICS history_rows = ROW_COUNT;

  SELECT count(*) INTO inserted_rows
  FROM "Setting" s
  WHERE s."scope" = 'EVENT' AND s."scopeId" = ev_id AND s."key" = ANY (copied_keys)
    AND s."id" = 'setmig_' || ev_id || '_' || s."key"
    AND EXISTS (SELECT 1 FROM "SettingChange" c
                WHERE c."id" = 'chgmig_' || ev_id || '_' || s."key" AND c."version" = 1);

  RAISE NOTICE
    'legacy retention copy: source rows %, copied %, migrated rows now present %, skipped existing [%], other known rows %, other rows %',
    source_rows, history_rows, inserted_rows, COALESCE(skipped, ''), known_rows, other_rows;
END
$$;
