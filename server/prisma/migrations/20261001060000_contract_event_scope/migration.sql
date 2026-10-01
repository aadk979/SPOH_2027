-- P09.10, contract (ADR-001 §2, Migration step 4): every event-owned row
-- names its event, and every reference stays inside it. eventId becomes NOT
-- NULL (backfilled in P09.4 and written by every repository since P09.5);
-- each parent gets a unique (eventId, id), and each reference becomes
-- (eventId, parentId) -> (eventId, id), so Postgres refuses a row in one event
-- pointing at a station, card or membership of another. Nullable references
-- are checked when set (MATCH SIMPLE). No action sets eventId to null.
-- Generated with prisma migrate diff against the P09.10 schema.

-- DropForeignKey
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_targetEventDayId_fkey";

-- DropForeignKey
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_targetStationId_fkey";

-- DropForeignKey
ALTER TABLE "AnnouncementAck" DROP CONSTRAINT "AnnouncementAck_announcementId_fkey";

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_eventDayId_fkey";

-- DropForeignKey
ALTER TABLE "AttendanceChallenge" DROP CONSTRAINT "AttendanceChallenge_eventDayId_fkey";

-- DropForeignKey
ALTER TABLE "BriefingSlot" DROP CONSTRAINT "BriefingSlot_eventDayId_fkey";

-- DropForeignKey
ALTER TABLE "CardStampEvent" DROP CONSTRAINT "CardStampEvent_missionCardId_fkey";

-- DropForeignKey
ALTER TABLE "CardStampEvent" DROP CONSTRAINT "CardStampEvent_stationId_fkey";

-- DropForeignKey
ALTER TABLE "EventMembership" DROP CONSTRAINT "EventMembership_reportsToId_fkey";

-- DropForeignKey
ALTER TABLE "FallbackWindow" DROP CONSTRAINT "FallbackWindow_stationId_fkey";

-- DropForeignKey
ALTER TABLE "FootfallTick" DROP CONSTRAINT "FootfallTick_stationId_fkey";

-- DropForeignKey
ALTER TABLE "GiftRedemption" DROP CONSTRAINT "GiftRedemption_giftTypeId_fkey";

-- DropForeignKey
ALTER TABLE "GiftRedemption" DROP CONSTRAINT "GiftRedemption_missionCardId_fkey";

-- DropForeignKey
ALTER TABLE "GiftRedemption" DROP CONSTRAINT "GiftRedemption_stationId_fkey";

-- DropForeignKey
ALTER TABLE "GiftStockAdjustment" DROP CONSTRAINT "GiftStockAdjustment_giftTypeId_fkey";

-- DropForeignKey
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_stationId_fkey";

-- DropForeignKey
ALTER TABLE "IncidentFollowUp" DROP CONSTRAINT "IncidentFollowUp_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "LostFoundItem" DROP CONSTRAINT "LostFoundItem_foundStationId_fkey";

-- DropForeignKey
ALTER TABLE "LostPersonAck" DROP CONSTRAINT "LostPersonAck_alertId_fkey";

-- DropForeignKey
ALTER TABLE "MissionCard" DROP CONSTRAINT "MissionCard_reissuedFromId_fkey";

-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_missionCardId_fkey";

-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_stationId_fkey";

-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_eventDayId_fkey";

-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_templateId_fkey";

-- DropForeignKey
ALTER TABLE "ShiftAssignment" DROP CONSTRAINT "ShiftAssignment_eventDayId_fkey";

-- DropForeignKey
ALTER TABLE "ShiftAssignment" DROP CONSTRAINT "ShiftAssignment_shiftId_fkey";

-- DropForeignKey
ALTER TABLE "ShiftAssignment" DROP CONSTRAINT "ShiftAssignment_stationId_fkey";

-- DropForeignKey
ALTER TABLE "ShiftSwapRequest" DROP CONSTRAINT "ShiftSwapRequest_assignmentId_fkey";

-- DropForeignKey
ALTER TABLE "Station" DROP CONSTRAINT "Station_typeId_fkey";

-- DropForeignKey
ALTER TABLE "StationTagging" DROP CONSTRAINT "StationTagging_stationId_fkey";

-- DropForeignKey
ALTER TABLE "StationTagging" DROP CONSTRAINT "StationTagging_tagId_fkey";

-- AlterTable
ALTER TABLE "Announcement" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AnnouncementAck" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Attendance" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AttendanceAttempt" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AttendanceChallenge" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BriefingSlot" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CardStampEvent" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "EventDay" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "FallbackWindow" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "FootfallTick" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "GiftRedemption" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "GiftStockAdjustment" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "GiftType" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ImportBatch" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Incident" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "IncidentFollowUp" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LostFoundItem" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LostPersonAck" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LostPersonAlert" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LostPersonSummary" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MissionCard" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Registration" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ShiftAssignment" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ShiftSwapRequest" ALTER COLUMN "eventId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Station" ALTER COLUMN "eventId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_eventId_id_key" ON "Announcement"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EventDay_eventId_id_key" ON "EventDay"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GiftType_eventId_id_key" ON "GiftType"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_eventId_id_key" ON "Incident"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LostPersonAlert_eventId_id_key" ON "LostPersonAlert"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MissionCard_eventId_id_key" ON "MissionCard"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_eventId_id_key" ON "ShiftAssignment"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Station_eventId_id_key" ON "Station"("eventId", "id");

-- AddForeignKey
ALTER TABLE "EventMembership" ADD CONSTRAINT "EventMembership_eventId_reportsToId_fkey" FOREIGN KEY ("eventId", "reportsToId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTagging" ADD CONSTRAINT "StationTagging_eventId_stationId_fkey" FOREIGN KEY ("eventId", "stationId") REFERENCES "Station"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTagging" ADD CONSTRAINT "StationTagging_eventId_tagId_fkey" FOREIGN KEY ("eventId", "tagId") REFERENCES "StationTag"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_eventId_eventDayId_fkey" FOREIGN KEY ("eventId", "eventDayId") REFERENCES "EventDay"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_eventId_templateId_fkey" FOREIGN KEY ("eventId", "templateId") REFERENCES "ShiftTemplate"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_eventId_typeId_fkey" FOREIGN KEY ("eventId", "typeId") REFERENCES "StationType"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_eventId_stationId_fkey" FOREIGN KEY ("eventId", "stationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_eventId_eventDayId_fkey" FOREIGN KEY ("eventId", "eventDayId") REFERENCES "EventDay"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_eventId_shiftId_fkey" FOREIGN KEY ("eventId", "shiftId") REFERENCES "Shift"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_eventId_membershipId_fkey" FOREIGN KEY ("eventId", "membershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventId_eventDayId_fkey" FOREIGN KEY ("eventId", "eventDayId") REFERENCES "EventDay"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventId_membershipId_fkey" FOREIGN KEY ("eventId", "membershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventId_verifiedByMembershipId_fkey" FOREIGN KEY ("eventId", "verifiedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceChallenge" ADD CONSTRAINT "AttendanceChallenge_eventId_eventDayId_fkey" FOREIGN KEY ("eventId", "eventDayId") REFERENCES "EventDay"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceChallenge" ADD CONSTRAINT "AttendanceChallenge_eventId_issuerMembershipId_fkey" FOREIGN KEY ("eventId", "issuerMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAttempt" ADD CONSTRAINT "AttendanceAttempt_eventId_membershipId_fkey" FOREIGN KEY ("eventId", "membershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_eventId_assignmentId_fkey" FOREIGN KEY ("eventId", "assignmentId") REFERENCES "ShiftAssignment"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_eventId_requesterMembershipId_fkey" FOREIGN KEY ("eventId", "requesterMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_eventId_targetMembershipId_fkey" FOREIGN KEY ("eventId", "targetMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_eventId_decidedByMembershipId_fkey" FOREIGN KEY ("eventId", "decidedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSlot" ADD CONSTRAINT "BriefingSlot_eventId_eventDayId_fkey" FOREIGN KEY ("eventId", "eventDayId") REFERENCES "EventDay"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSlot" ADD CONSTRAINT "BriefingSlot_eventId_briefierMembershipId_fkey" FOREIGN KEY ("eventId", "briefierMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_stationId_fkey" FOREIGN KEY ("eventId", "stationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_missionCardId_fkey" FOREIGN KEY ("eventId", "missionCardId") REFERENCES "MissionCard"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_categoryId_fkey" FOREIGN KEY ("eventId", "categoryId") REFERENCES "CaptureCategory"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_recordedByMembershipId_fkey" FOREIGN KEY ("eventId", "recordedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FootfallTick" ADD CONSTRAINT "FootfallTick_eventId_stationId_fkey" FOREIGN KEY ("eventId", "stationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FootfallTick" ADD CONSTRAINT "FootfallTick_eventId_recordedByMembershipId_fkey" FOREIGN KEY ("eventId", "recordedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCard" ADD CONSTRAINT "MissionCard_eventId_reissuedFromId_fkey" FOREIGN KEY ("eventId", "reissuedFromId") REFERENCES "MissionCard"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStampEvent" ADD CONSTRAINT "CardStampEvent_eventId_missionCardId_fkey" FOREIGN KEY ("eventId", "missionCardId") REFERENCES "MissionCard"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStampEvent" ADD CONSTRAINT "CardStampEvent_eventId_stationId_fkey" FOREIGN KEY ("eventId", "stationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStampEvent" ADD CONSTRAINT "CardStampEvent_eventId_recordedByMembershipId_fkey" FOREIGN KEY ("eventId", "recordedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_eventId_giftTypeId_fkey" FOREIGN KEY ("eventId", "giftTypeId") REFERENCES "GiftType"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_eventId_missionCardId_fkey" FOREIGN KEY ("eventId", "missionCardId") REFERENCES "MissionCard"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_eventId_stationId_fkey" FOREIGN KEY ("eventId", "stationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_eventId_recordedByMembershipId_fkey" FOREIGN KEY ("eventId", "recordedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftStockAdjustment" ADD CONSTRAINT "GiftStockAdjustment_eventId_giftTypeId_fkey" FOREIGN KEY ("eventId", "giftTypeId") REFERENCES "GiftType"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftStockAdjustment" ADD CONSTRAINT "GiftStockAdjustment_eventId_createdByMembershipId_fkey" FOREIGN KEY ("eventId", "createdByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_eventId_stationId_fkey" FOREIGN KEY ("eventId", "stationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_eventId_reportedByMembershipId_fkey" FOREIGN KEY ("eventId", "reportedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_eventId_incidentId_fkey" FOREIGN KEY ("eventId", "incidentId") REFERENCES "Incident"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_eventId_authorMembershipId_fkey" FOREIGN KEY ("eventId", "authorMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAlert" ADD CONSTRAINT "LostPersonAlert_eventId_lastSeenStationId_fkey" FOREIGN KEY ("eventId", "lastSeenStationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAlert" ADD CONSTRAINT "LostPersonAlert_eventId_raisedByMembershipId_fkey" FOREIGN KEY ("eventId", "raisedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAck" ADD CONSTRAINT "LostPersonAck_eventId_alertId_fkey" FOREIGN KEY ("eventId", "alertId") REFERENCES "LostPersonAlert"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAck" ADD CONSTRAINT "LostPersonAck_eventId_membershipId_fkey" FOREIGN KEY ("eventId", "membershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_eventId_foundStationId_fkey" FOREIGN KEY ("eventId", "foundStationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_eventId_loggedByMembershipId_fkey" FOREIGN KEY ("eventId", "loggedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_eventId_targetStationId_fkey" FOREIGN KEY ("eventId", "targetStationId") REFERENCES "Station"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_eventId_targetEventDayId_fkey" FOREIGN KEY ("eventId", "targetEventDayId") REFERENCES "EventDay"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_eventId_authorMembershipId_fkey" FOREIGN KEY ("eventId", "authorMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAck" ADD CONSTRAINT "AnnouncementAck_eventId_announcementId_fkey" FOREIGN KEY ("eventId", "announcementId") REFERENCES "Announcement"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAck" ADD CONSTRAINT "AnnouncementAck_eventId_membershipId_fkey" FOREIGN KEY ("eventId", "membershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FallbackWindow" ADD CONSTRAINT "FallbackWindow_eventId_stationId_fkey" FOREIGN KEY ("eventId", "stationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FallbackWindow" ADD CONSTRAINT "FallbackWindow_eventId_declaredByMembershipId_fkey" FOREIGN KEY ("eventId", "declaredByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_eventId_importedByMembershipId_fkey" FOREIGN KEY ("eventId", "importedByMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

