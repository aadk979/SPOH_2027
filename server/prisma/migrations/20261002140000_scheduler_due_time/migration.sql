BEGIN;

-- Additive: older enqueue writers remain valid. The first claim initialises new null rows.
ALTER TABLE "ScheduledAction" ADD COLUMN "scheduledFor" TIMESTAMPTZ(3);
UPDATE "ScheduledAction" SET "scheduledFor" = "runAt";
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_due_check"
  CHECK ("scheduledFor" IS NULL OR "scheduledFor" <= "runAt");

COMMIT;
