-- P10.2 (legacy settings store, contract): drop the AppSetting table (ADR-003
-- Migration §1, D-18).
--
-- Every key it held now lives elsewhere, and nothing reads or writes it:
--
--   key                                    where it went
--   -------------------------------------  ----------------------------------------
--   silentStationMinutes, staleDeviceMinutes, implausibleTapsPerMinute,
--   longShiftMinutes                       20261006090000_copy_threshold_settings
--   captureUndoWindowSeconds, captureSendGraceSeconds, outboxWarningCount,
--   outboxWarningAgeMinutes                20261007090000_copy_capture_settings
--   lostPersonPurgeHours                   20261007110000_copy_lost_person_retention
--   dashboardPollSeconds, alertPollSeconds, refreshSessionDays,
--   idempotencyRetentionDays               20261007130000_copy_organisation_settings
--   eventName                              not copied: Event.name is the event's
--                                          name, and the app never showed this one
--
-- The preceding release stopped the last writer (the legacy PATCH refuses every
-- key) and was the only running task before this migration. A key outside this
-- list would be a value nobody accounted for, so the migration fails rather than
-- drop it.
DO $$
DECLARE
  unknown text;
BEGIN
  SELECT string_agg(key, ', ' ORDER BY key) INTO unknown
  FROM "AppSetting"
  WHERE key NOT IN (
    'silentStationMinutes', 'staleDeviceMinutes', 'implausibleTapsPerMinute',
    'longShiftMinutes', 'captureUndoWindowSeconds', 'captureSendGraceSeconds',
    'outboxWarningCount', 'outboxWarningAgeMinutes', 'lostPersonPurgeHours',
    'dashboardPollSeconds', 'alertPollSeconds', 'refreshSessionDays',
    'idempotencyRetentionDays', 'eventName'
  );
  IF unknown IS NOT NULL THEN
    RAISE EXCEPTION 'AppSetting holds keys no migration accounted for: %', unknown;
  END IF;
END $$;

DROP TABLE "AppSetting";
