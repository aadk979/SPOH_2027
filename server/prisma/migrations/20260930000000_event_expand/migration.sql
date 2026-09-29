-- P09.1, expand (ADR-001, ADR-009): the event becomes a first-class row.
-- Organisation and Event are new; every event-owned table gains a NULLABLE
-- eventId with an index leading with it and a RESTRICT foreign key. Nothing
-- reads the new columns yet, so the app behaves exactly as before. P09.4
-- backfills Event #1, and P09.10 makes eventId NOT NULL. Reversible until then
-- by dropping the columns, the two tables and the enum.

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "AnnouncementAck" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "AttendanceAttempt" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "AttendanceChallenge" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "BriefingSlot" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "CardStampEvent" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "EventDay" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "FallbackWindow" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "FootfallTick" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "GiftRedemption" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "GiftStockAdjustment" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "GiftType" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "IdempotencyRecord" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "IncidentFollowUp" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "LostFoundItem" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "LostPersonAck" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "LostPersonAlert" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "LostPersonSummary" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "MissionCard" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "ShiftAssignment" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "ShiftSwapRequest" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "Station" ADD COLUMN     "eventId" TEXT;

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-SG',
    "defaultTimezone" TEXT NOT NULL,
    "branding" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue" TEXT,
    "timezone" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-SG',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "dayBoundaryMinutes" INTEGER NOT NULL DEFAULT 0,
    "branding" JSONB,
    "clonedFromEventId" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Event_organisationId_slug_key" ON "Event"("organisationId", "slug");

-- CreateIndex
CREATE INDEX "Announcement_eventId_createdAt_idx" ON "Announcement"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "AnnouncementAck_eventId_idx" ON "AnnouncementAck"("eventId");

-- CreateIndex
CREATE INDEX "Attendance_eventId_eventDayId_idx" ON "Attendance"("eventId", "eventDayId");

-- CreateIndex
CREATE INDEX "AttendanceAttempt_eventId_idx" ON "AttendanceAttempt"("eventId");

-- CreateIndex
CREATE INDEX "AttendanceChallenge_eventId_idx" ON "AttendanceChallenge"("eventId");

-- CreateIndex
CREATE INDEX "AuditLog_eventId_createdAt_idx" ON "AuditLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "BriefingSlot_eventId_eventDayId_idx" ON "BriefingSlot"("eventId", "eventDayId");

-- CreateIndex
CREATE INDEX "CardStampEvent_eventId_recordedAt_idx" ON "CardStampEvent"("eventId", "recordedAt");

-- CreateIndex
CREATE INDEX "EventDay_eventId_date_idx" ON "EventDay"("eventId", "date");

-- CreateIndex
CREATE INDEX "FallbackWindow_eventId_startedAt_idx" ON "FallbackWindow"("eventId", "startedAt");

-- CreateIndex
CREATE INDEX "FootfallTick_eventId_recordedAt_idx" ON "FootfallTick"("eventId", "recordedAt");

-- CreateIndex
CREATE INDEX "GiftRedemption_eventId_recordedAt_idx" ON "GiftRedemption"("eventId", "recordedAt");

-- CreateIndex
CREATE INDEX "GiftStockAdjustment_eventId_idx" ON "GiftStockAdjustment"("eventId");

-- CreateIndex
CREATE INDEX "GiftType_eventId_idx" ON "GiftType"("eventId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_eventId_idx" ON "IdempotencyRecord"("eventId");

-- CreateIndex
CREATE INDEX "ImportBatch_eventId_idx" ON "ImportBatch"("eventId");

-- CreateIndex
CREATE INDEX "Incident_eventId_status_idx" ON "Incident"("eventId", "status");

-- CreateIndex
CREATE INDEX "IncidentFollowUp_eventId_idx" ON "IncidentFollowUp"("eventId");

-- CreateIndex
CREATE INDEX "LostFoundItem_eventId_status_idx" ON "LostFoundItem"("eventId", "status");

-- CreateIndex
CREATE INDEX "LostPersonAck_eventId_idx" ON "LostPersonAck"("eventId");

-- CreateIndex
CREATE INDEX "LostPersonAlert_eventId_status_idx" ON "LostPersonAlert"("eventId", "status");

-- CreateIndex
CREATE INDEX "LostPersonSummary_eventId_idx" ON "LostPersonSummary"("eventId");

-- CreateIndex
CREATE INDEX "MissionCard_eventId_status_idx" ON "MissionCard"("eventId", "status");

-- CreateIndex
CREATE INDEX "Registration_eventId_recordedAt_idx" ON "Registration"("eventId", "recordedAt");

-- CreateIndex
CREATE INDEX "ShiftAssignment_eventId_stationId_idx" ON "ShiftAssignment"("eventId", "stationId");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_eventId_status_idx" ON "ShiftSwapRequest"("eventId", "status");

-- CreateIndex
CREATE INDEX "Station_eventId_code_idx" ON "Station"("eventId", "code");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clonedFromEventId_fkey" FOREIGN KEY ("clonedFromEventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDay" ADD CONSTRAINT "EventDay_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceChallenge" ADD CONSTRAINT "AttendanceChallenge_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAttempt" ADD CONSTRAINT "AttendanceAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSlot" ADD CONSTRAINT "BriefingSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FootfallTick" ADD CONSTRAINT "FootfallTick_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCard" ADD CONSTRAINT "MissionCard_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStampEvent" ADD CONSTRAINT "CardStampEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftType" ADD CONSTRAINT "GiftType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftStockAdjustment" ADD CONSTRAINT "GiftStockAdjustment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAlert" ADD CONSTRAINT "LostPersonAlert_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAck" ADD CONSTRAINT "LostPersonAck_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonSummary" ADD CONSTRAINT "LostPersonSummary_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAck" ADD CONSTRAINT "AnnouncementAck_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FallbackWindow" ADD CONSTRAINT "FallbackWindow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

