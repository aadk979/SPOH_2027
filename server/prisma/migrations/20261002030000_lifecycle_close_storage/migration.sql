BEGIN;
-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('USER', 'SYSTEM', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "ReportSnapshotKind" AS ENUM ('DAILY', 'FINAL');

-- CreateEnum
CREATE TYPE "ScheduledActionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "scheduledActionId" TEXT,
ADD COLUMN     "source" "AuditSource" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "ReportSnapshotKind" NOT NULL,
    "lifecycleVersion" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "rehearsalIncluded" BOOLEAN NOT NULL DEFAULT false,
    "report" JSONB NOT NULL,
    "createdByPersonId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAction" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ScheduledActionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMPTZ(3),
    "recurrence" INTEGER,
    "dedupeKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByPersonId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ScheduledAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportSnapshot_eventId_kind_supersededAt_idx" ON "ReportSnapshot"("eventId", "kind", "supersededAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSnapshot_eventId_id_key" ON "ReportSnapshot"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSnapshot_eventId_dedupeKey_key" ON "ReportSnapshot"("eventId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAction_dedupeKey_key" ON "ScheduledAction"("dedupeKey");

-- CreateIndex
CREATE INDEX "ScheduledAction_status_runAt_idx" ON "ScheduledAction"("status", "runAt");

-- CreateIndex
CREATE INDEX "ScheduledAction_status_lockedUntil_idx" ON "ScheduledAction"("status", "lockedUntil");

-- CreateIndex
CREATE INDEX "ScheduledAction_eventId_runAt_id_idx" ON "ScheduledAction"("eventId", "runAt", "id");

-- CreateIndex
CREATE INDEX "AuditLog_scheduledActionId_idx" ON "AuditLog"("scheduledActionId");

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_createdByPersonId_fkey" FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_createdByPersonId_fkey" FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_scheduledActionId_fkey" FOREIGN KEY ("scheduledActionId") REFERENCES "ScheduledAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingChange" ADD CONSTRAINT "SettingChange_scheduledActionId_fkey" FOREIGN KEY ("scheduledActionId") REFERENCES "ScheduledAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "AuditLog" SET source = 'SYSTEM' WHERE "actorSub" = 'system';

ALTER TABLE "ReportSnapshot"
  ADD CONSTRAINT "ReportSnapshot_version_check" CHECK ("lifecycleVersion" >= 0),
  ADD CONSTRAINT "ReportSnapshot_final_key_check" CHECK (kind <> 'FINAL' OR "dedupeKey" = 'final:' || "lifecycleVersion"::text),
  ADD CONSTRAINT "ReportSnapshot_final_mode_check" CHECK (kind <> 'FINAL' OR "rehearsalIncluded" = false),
  ADD CONSTRAINT "ReportSnapshot_superseded_check" CHECK ("supersededAt" IS NULL OR "supersededAt" >= "createdAt");
ALTER TABLE "ScheduledAction"
  ADD CONSTRAINT "ScheduledAction_attempts_check" CHECK ("maxAttempts" BETWEEN 1 AND 10 AND attempts BETWEEN 0 AND "maxAttempts"),
  ADD CONSTRAINT "ScheduledAction_version_check" CHECK (version > 0),
  ADD CONSTRAINT "ScheduledAction_recurrence_check" CHECK (recurrence IS NULL OR recurrence > 0),
  ADD CONSTRAINT "ScheduledAction_error_check" CHECK ("lastError" IS NULL OR length("lastError") <= 500),
  ADD CONSTRAINT "ScheduledAction_lease_check" CHECK (
    ("lockedBy" IS NULL) = ("lockedUntil" IS NULL)
    AND (status = 'RUNNING') = ("lockedBy" IS NOT NULL)
  ),
  ADD CONSTRAINT "ScheduledAction_completion_check" CHECK (
    (status IN ('SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED')) = ("completedAt" IS NOT NULL)
  );
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schedule_source_check"
  CHECK ((source = 'SCHEDULE') = ("scheduledActionId" IS NOT NULL));

-- Scope cannot drift after an action is created; existing audit/history references remain valid.
CREATE FUNCTION public.protect_scheduled_action_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."eventId" IS DISTINCT FROM OLD."eventId" THEN
    RAISE EXCEPTION 'Scheduled action scope is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ScheduledAction_protect_scope" BEFORE UPDATE OF "eventId" ON "ScheduledAction"
  FOR EACH ROW EXECUTE FUNCTION public.protect_scheduled_action_scope();

-- A nullable platform scope still has to match exactly; a nullable composite FK would skip it.
CREATE FUNCTION public.enforce_scheduled_record_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."scheduledActionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ScheduledAction" WHERE id = NEW."scheduledActionId"
      AND "eventId" IS NOT DISTINCT FROM NEW."eventId"
  ) THEN
    RAISE EXCEPTION 'Scheduled record must name its action scope' USING ERRCODE = '23503';
  END IF;
  IF TG_TABLE_NAME = 'AuditLog' THEN
    IF NEW."actorSub" = 'system' AND NEW.source = 'USER' THEN
      NEW.source := 'SYSTEM';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AuditLog_schedule_scope" BEFORE INSERT OR UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_scheduled_record_scope();
CREATE TRIGGER "SettingChange_schedule_scope" BEFORE INSERT OR UPDATE ON "SettingChange"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_scheduled_record_scope();

-- A frozen document can be superseded once, but cannot be edited or revived.
CREATE FUNCTION public.protect_report_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'supersededAt') IS DISTINCT FROM (to_jsonb(OLD) - 'supersededAt')
    OR (OLD."supersededAt" IS NOT NULL AND NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt") THEN
    RAISE EXCEPTION 'Frozen report is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ReportSnapshot_protect_frozen" BEFORE UPDATE ON "ReportSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.protect_report_snapshot();
COMMIT;
