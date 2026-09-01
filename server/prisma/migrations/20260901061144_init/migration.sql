-- CreateEnum
CREATE TYPE "VisitorCategory" AS ENUM ('SEC_1', 'SEC_2', 'SEC_3', 'SEC_4', 'SEC_5', 'GRADUATED_AWAITING_RESULTS', 'PARENT_GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "StationKind" AS ENUM ('SIGNUP_BOOTH', 'WELCOME_LOUNGE', 'COURSE_STATION', 'MISSION_COMPLETE', 'WELCOME_PARTY', 'OTHER');

-- CreateEnum
CREATE TYPE "CourseCode" AS ENUM ('DAAA', 'DCDF', 'DCS', 'DCITP');

-- CreateEnum
CREATE TYPE "CommitteeRole" AS ENUM ('VOLUNTEER', 'IC', 'DEPUTY_COORDINATOR', 'CHIEF_COORDINATOR', 'LEAD', 'ADMIN');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('APP', 'FALLBACK_SHEET', 'PAPER', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ShiftBlock" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('INJURY', 'ILLNESS', 'NEAR_MISS', 'SAFETY_CONCERN', 'CROWD_CONCERN', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "LostPersonStatus" AS ENUM ('ACTIVE', 'RESOLVED_FOUND', 'RESOLVED_OTHER');

-- CreateEnum
CREATE TYPE "LostFoundStatus" AS ENUM ('HELD', 'CLAIMED', 'UNCLAIMED_AT_CLOSE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('UNISSUED', 'ISSUED', 'COMPLETED', 'VOIDED', 'LOST');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('INFO', 'OPERATIONAL', 'URGENT');

-- CreateTable
CREATE TABLE "EventDay" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "isPublicDay" BOOLEAN NOT NULL DEFAULT true,
    "isTourDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StationKind" NOT NULL,
    "courseCode" "CourseCode",
    "floor" TEXT,
    "countsEntry" BOOLEAN NOT NULL DEFAULT false,
    "issuesStamp" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Volunteer" (
    "id" TEXT NOT NULL,
    "cognitoSub" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "CommitteeRole" NOT NULL DEFAULT 'VOLUNTEER',
    "portfolio" TEXT,
    "reportsToId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Volunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "block" "ShiftBlock" NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftSwapRequest" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingSlot" (
    "id" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "briefierId" TEXT,
    "waveSize" INTEGER NOT NULL DEFAULT 20,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "BriefingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "category" "VisitorCategory" NOT NULL,
    "stationId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "groupId" TEXT,
    "missionCardId" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'APP',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientRecordedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedReason" TEXT,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FootfallTick" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "source" "DataSource" NOT NULL DEFAULT 'APP',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientRecordedAt" TIMESTAMP(3),
    "timeBlockStart" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "voided" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FootfallTick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionCard" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'UNISSUED',
    "issuedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "reissuedFromId" TEXT,
    "batchLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardStampEvent" (
    "id" TEXT NOT NULL,
    "missionCardId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'APP',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientRecordedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "CardStampEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initialStock" INTEGER NOT NULL,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 50,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GiftType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftRedemption" (
    "id" TEXT NOT NULL,
    "giftTypeId" TEXT NOT NULL,
    "missionCardId" TEXT,
    "stationId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'APP',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "voided" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GiftRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftStockAdjustment" (
    "id" TEXT NOT NULL,
    "giftTypeId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftStockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "stationId" TEXT,
    "locationNote" TEXT,
    "description" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentFollowUp" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostPersonAlert" (
    "id" TEXT NOT NULL,
    "status" "LostPersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "approxAge" TEXT,
    "descriptionText" TEXT,
    "clothingText" TEXT,
    "lastSeenStationId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "LostPersonAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostPersonAck" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LostPersonAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostPersonSummary" (
    "id" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "outcome" "LostPersonStatus" NOT NULL,
    "ackCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LostPersonSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostFoundItem" (
    "id" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "categoryLabel" TEXT,
    "foundStationId" TEXT,
    "foundAt" TIMESTAMP(3) NOT NULL,
    "holderNote" TEXT,
    "photoKey" TEXT,
    "status" "LostFoundStatus" NOT NULL DEFAULT 'HELD',
    "loggedById" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LostFoundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'INFO',
    "targetRole" "CommitteeRole",
    "targetStationId" TEXT,
    "targetEventDayId" TEXT,
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementAck" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FallbackWindow" (
    "id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "stationId" TEXT,
    "declaredById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FallbackWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "targetTable" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "fileName" TEXT,
    "importedById" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorSub" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "actorSub" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventDay_date_key" ON "EventDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE INDEX "Station_kind_active_idx" ON "Station"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Volunteer_cognitoSub_key" ON "Volunteer"("cognitoSub");

-- CreateIndex
CREATE UNIQUE INDEX "Volunteer_email_key" ON "Volunteer"("email");

-- CreateIndex
CREATE INDEX "Volunteer_role_active_idx" ON "Volunteer"("role", "active");

-- CreateIndex
CREATE INDEX "ShiftAssignment_stationId_eventDayId_block_idx" ON "ShiftAssignment"("stationId", "eventDayId", "block");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_volunteerId_eventDayId_block_key" ON "ShiftAssignment"("volunteerId", "eventDayId", "block");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_status_idx" ON "ShiftSwapRequest"("status");

-- CreateIndex
CREATE INDEX "BriefingSlot_eventDayId_startsAt_idx" ON "BriefingSlot"("eventDayId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_idempotencyKey_key" ON "Registration"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Registration_recordedAt_idx" ON "Registration"("recordedAt");

-- CreateIndex
CREATE INDEX "Registration_category_recordedAt_idx" ON "Registration"("category", "recordedAt");

-- CreateIndex
CREATE INDEX "Registration_groupId_idx" ON "Registration"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "FootfallTick_idempotencyKey_key" ON "FootfallTick"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FootfallTick_stationId_recordedAt_idx" ON "FootfallTick"("stationId", "recordedAt");

-- CreateIndex
CREATE INDEX "FootfallTick_recordedAt_idx" ON "FootfallTick"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MissionCard_shortCode_key" ON "MissionCard"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "MissionCard_qrPayload_key" ON "MissionCard"("qrPayload");

-- CreateIndex
CREATE INDEX "MissionCard_status_idx" ON "MissionCard"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CardStampEvent_idempotencyKey_key" ON "CardStampEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CardStampEvent_recordedAt_idx" ON "CardStampEvent"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CardStampEvent_missionCardId_stationId_key" ON "CardStampEvent"("missionCardId", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftType_name_key" ON "GiftType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GiftRedemption_idempotencyKey_key" ON "GiftRedemption"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GiftRedemption_giftTypeId_recordedAt_idx" ON "GiftRedemption"("giftTypeId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_idempotencyKey_key" ON "Incident"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Incident_status_severity_idx" ON "Incident"("status", "severity");

-- CreateIndex
CREATE INDEX "Incident_reportedAt_idx" ON "Incident"("reportedAt");

-- CreateIndex
CREATE INDEX "IncidentFollowUp_incidentId_createdAt_idx" ON "IncidentFollowUp"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "LostPersonAlert_status_idx" ON "LostPersonAlert"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LostPersonAck_alertId_volunteerId_key" ON "LostPersonAck"("alertId", "volunteerId");

-- CreateIndex
CREATE INDEX "LostFoundItem_status_idx" ON "LostFoundItem"("status");

-- CreateIndex
CREATE INDEX "Announcement_createdAt_idx" ON "Announcement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementAck_announcementId_volunteerId_key" ON "AnnouncementAck"("announcementId", "volunteerId");

-- CreateIndex
CREATE INDEX "FallbackWindow_startedAt_idx" ON "FallbackWindow"("startedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

-- AddForeignKey
ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ShiftAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSlot" ADD CONSTRAINT "BriefingSlot_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSlot" ADD CONSTRAINT "BriefingSlot_briefierId_fkey" FOREIGN KEY ("briefierId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_missionCardId_fkey" FOREIGN KEY ("missionCardId") REFERENCES "MissionCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FootfallTick" ADD CONSTRAINT "FootfallTick_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FootfallTick" ADD CONSTRAINT "FootfallTick_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCard" ADD CONSTRAINT "MissionCard_reissuedFromId_fkey" FOREIGN KEY ("reissuedFromId") REFERENCES "MissionCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStampEvent" ADD CONSTRAINT "CardStampEvent_missionCardId_fkey" FOREIGN KEY ("missionCardId") REFERENCES "MissionCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStampEvent" ADD CONSTRAINT "CardStampEvent_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStampEvent" ADD CONSTRAINT "CardStampEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_giftTypeId_fkey" FOREIGN KEY ("giftTypeId") REFERENCES "GiftType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_missionCardId_fkey" FOREIGN KEY ("missionCardId") REFERENCES "MissionCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRedemption" ADD CONSTRAINT "GiftRedemption_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftStockAdjustment" ADD CONSTRAINT "GiftStockAdjustment_giftTypeId_fkey" FOREIGN KEY ("giftTypeId") REFERENCES "GiftType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAlert" ADD CONSTRAINT "LostPersonAlert_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAck" ADD CONSTRAINT "LostPersonAck_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "LostPersonAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAck" ADD CONSTRAINT "AnnouncementAck_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
