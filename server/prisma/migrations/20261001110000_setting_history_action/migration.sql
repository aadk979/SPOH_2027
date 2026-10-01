-- P10.2: retain the scheduled action that caused a setting change once P10.6
-- starts applying scheduled writes. No foreign key until ScheduledAction exists.
ALTER TABLE "SettingChange" ADD COLUMN "scheduledActionId" TEXT;
