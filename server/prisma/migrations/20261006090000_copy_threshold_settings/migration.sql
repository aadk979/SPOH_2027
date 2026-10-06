-- P10.2 (release B, part 1): copy the four operational thresholds from the legacy
-- AppSetting table into the scoped Setting store, with MIGRATION history.
--
-- Additive and re-runnable. Nothing is dropped, rewritten or deleted: the legacy
-- row stays where it is as the retained source (ADR-003 Migration, plan
-- .local/p10-legacy-readers-plan-20261006.md).
--
-- Reviewed key mapping (every key of RuntimeSettings, plus the other rows that
-- may exist in AppSetting):
--
--   key                        disposition in this migration
--   -------------------------  ---------------------------------------------------
--   silentStationMinutes       COPY  -> EVENT scope of Event #1 (evt_spoh2027)
--   staleDeviceMinutes         COPY  -> EVENT scope of Event #1
--   implausibleTapsPerMinute   COPY  -> EVENT scope of Event #1
--   longShiftMinutes           COPY  -> EVENT scope of Event #1
--   eventName                  DEFERRED: still written by the legacy PATCH; Event.name
--                              already holds the migrated name and must not be overwritten
--   lostPersonPurgeHours, captureUndoWindowSeconds, captureSendGraceSeconds,
--   outboxWarningCount, outboxWarningAgeMinutes
--                              DEFERRED (Event #1 when migrated): their legacy
--                              writer and readers are still live, so a copy now
--                              would go stale
--   idempotencyRetentionDays, refreshSessionDays, dashboardPollSeconds,
--   alertPollSeconds           DEFERRED (platform scope of Event #1's organisation)
--                              for the same reason
--   any other key              DEFERRED: stays in AppSetting; reported by count only
--
-- Why only these four: release A retired their legacy writes, so no instance can
-- change them in AppSetting after this copy. The others can still be changed
-- through the legacy endpoint, so copying them now would not stay current.
--
-- Rules:
--   * The value is copied as stored (raw JSON), including a value that fails its
--     registry schema: the resolver skips an invalid scoped value and falls
--     through, and the stored evidence is kept (ADR-003 §2).
--   * Version 1, the original updatedAt and the original updater (only when that
--     person still exists). The SettingChange has a null "before" (no override
--     existed), the exact raw "after", source MIGRATION and a fixed reason. Its
--     createdAt is the migration time.
--   * Never overwrites: a key is copied only when the target has neither a Setting
--     row nor any SettingChange history. Existing rows (e.g. written through the
--     catalogue since release A) and a reset (RESET history without a row) are
--     authoritative. Skipped keys are reported by name, never by value.
--   * Event #1 is the established identity evt_spoh2027. If rows need copying and
--     it does not exist, the migration fails rather than guess a destination.
--   * No station overrides are invented, and no default is materialised.
--   * Row and history inserts are one statement, so their counts always match;
--     a failure rolls the whole migration back. The Event row is locked first,
--     the order catalogue writes use, so a concurrent write cannot interleave.
DO $$
DECLARE
  ev_id CONSTANT text := 'evt_spoh2027';
  copied_keys CONSTANT text[] := ARRAY[
    'silentStationMinutes', 'staleDeviceMinutes', 'implausibleTapsPerMinute', 'longShiftMinutes'
  ];
  deferred_keys CONSTANT text[] := ARRAY[
    'eventName', 'lostPersonPurgeHours', 'captureUndoWindowSeconds', 'captureSendGraceSeconds',
    'outboxWarningCount', 'outboxWarningAgeMinutes', 'idempotencyRetentionDays',
    'refreshSessionDays', 'dashboardPollSeconds', 'alertPollSeconds'
  ];
  source_rows integer;
  inserted_rows integer;
  history_rows integer;
  skipped text;
  deferred_rows integer;
  other_rows integer;
BEGIN
  SELECT count(*) INTO source_rows FROM "AppSetting" WHERE "key" = ANY (copied_keys);
  SELECT count(*) INTO deferred_rows FROM "AppSetting" WHERE "key" = ANY (deferred_keys);
  SELECT count(*) INTO other_rows FROM "AppSetting"
    WHERE NOT ("key" = ANY (copied_keys)) AND NOT ("key" = ANY (deferred_keys));

  IF source_rows = 0 THEN
    RAISE NOTICE 'legacy threshold copy: nothing to copy (deferred rows %, other rows %)',
      deferred_rows, other_rows;
    RETURN;
  END IF;

  -- Serialise with catalogue writes on the same event (Event before Setting).
  PERFORM 1 FROM "Event" WHERE "id" = ev_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'legacy threshold copy: % legacy row(s) need copying but event % does not exist',
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
    'legacy threshold copy: source rows %, copied %, migrated rows now present %, skipped existing [%], deferred rows %, other rows %',
    source_rows, history_rows, inserted_rows, COALESCE(skipped, ''), deferred_rows, other_rows;
END
$$;
