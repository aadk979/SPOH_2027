-- P09.3, expand (ADR-001 §1): people and memberships. The Prisma model Volunteer
-- becomes Person over the same table (a code change only; ids and cognitoSub
-- links stay). New OrganisationMembership and EventMembership, and a nullable
-- membership id beside each event row's people column, indexed. P09.4 creates
-- the memberships and backfills; P09.5 reads them; P09.10 adds the composite
-- foreign keys and drops what memberships replace. Reversible by dropping the
-- new tables, columns and enums.

-- CreateEnum
CREATE TYPE "OrganisationRole" AS ENUM ('MEMBER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DEACTIVATED', 'ENDED');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "authorMembershipId" TEXT;

-- AlterTable
ALTER TABLE "AnnouncementAck" ADD COLUMN     "membershipId" TEXT;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "membershipId" TEXT,
ADD COLUMN     "verifiedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "AttendanceAttempt" ADD COLUMN     "membershipId" TEXT;

-- AlterTable
ALTER TABLE "AttendanceChallenge" ADD COLUMN     "issuerMembershipId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "membershipId" TEXT;

-- AlterTable
ALTER TABLE "BriefingSlot" ADD COLUMN     "briefierMembershipId" TEXT;

-- AlterTable
ALTER TABLE "CardStampEvent" ADD COLUMN     "recordedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "FallbackWindow" ADD COLUMN     "declaredByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "FootfallTick" ADD COLUMN     "recordedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "GiftRedemption" ADD COLUMN     "recordedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "GiftStockAdjustment" ADD COLUMN     "createdByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "importedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "reportedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "IncidentFollowUp" ADD COLUMN     "authorMembershipId" TEXT;

-- AlterTable
ALTER TABLE "LostFoundItem" ADD COLUMN     "loggedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "LostPersonAck" ADD COLUMN     "membershipId" TEXT;

-- AlterTable
ALTER TABLE "LostPersonAlert" ADD COLUMN     "raisedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "recordedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "ShiftAssignment" ADD COLUMN     "membershipId" TEXT;

-- AlterTable
ALTER TABLE "ShiftSwapRequest" ADD COLUMN     "decidedByMembershipId" TEXT,
ADD COLUMN     "requesterMembershipId" TEXT,
ADD COLUMN     "targetMembershipId" TEXT;

-- CreateTable
CREATE TABLE "OrganisationMembership" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "OrganisationRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganisationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMembership" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "CommitteeRole" NOT NULL DEFAULT 'VOLUNTEER',
    "portfolio" TEXT,
    "reportsToId" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedAt" TIMESTAMPTZ(3),
    "acceptedAt" TIMESTAMPTZ(3),
    "deactivatedAt" TIMESTAMPTZ(3),
    "deactivatedReason" TEXT,
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationMembership_organisationId_personId_key" ON "OrganisationMembership"("organisationId", "personId");

-- CreateIndex
CREATE INDEX "EventMembership_eventId_role_status_idx" ON "EventMembership"("eventId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventMembership_eventId_personId_key" ON "EventMembership"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "EventMembership_eventId_id_key" ON "EventMembership"("eventId", "id");

-- CreateIndex
CREATE INDEX "Announcement_authorMembershipId_idx" ON "Announcement"("authorMembershipId");

-- CreateIndex
CREATE INDEX "AnnouncementAck_membershipId_idx" ON "AnnouncementAck"("membershipId");

-- CreateIndex
CREATE INDEX "Attendance_membershipId_idx" ON "Attendance"("membershipId");

-- CreateIndex
CREATE INDEX "Attendance_verifiedByMembershipId_idx" ON "Attendance"("verifiedByMembershipId");

-- CreateIndex
CREATE INDEX "AttendanceAttempt_membershipId_idx" ON "AttendanceAttempt"("membershipId");

-- CreateIndex
CREATE INDEX "AttendanceChallenge_issuerMembershipId_idx" ON "AttendanceChallenge"("issuerMembershipId");

-- CreateIndex
CREATE INDEX "AuditLog_membershipId_idx" ON "AuditLog"("membershipId");

-- CreateIndex
CREATE INDEX "BriefingSlot_briefierMembershipId_idx" ON "BriefingSlot"("briefierMembershipId");

-- CreateIndex
CREATE INDEX "CardStampEvent_recordedByMembershipId_idx" ON "CardStampEvent"("recordedByMembershipId");

-- CreateIndex
CREATE INDEX "FallbackWindow_declaredByMembershipId_idx" ON "FallbackWindow"("declaredByMembershipId");

-- CreateIndex
CREATE INDEX "FootfallTick_recordedByMembershipId_idx" ON "FootfallTick"("recordedByMembershipId");

-- CreateIndex
CREATE INDEX "GiftRedemption_recordedByMembershipId_idx" ON "GiftRedemption"("recordedByMembershipId");

-- CreateIndex
CREATE INDEX "GiftStockAdjustment_createdByMembershipId_idx" ON "GiftStockAdjustment"("createdByMembershipId");

-- CreateIndex
CREATE INDEX "ImportBatch_importedByMembershipId_idx" ON "ImportBatch"("importedByMembershipId");

-- CreateIndex
CREATE INDEX "Incident_reportedByMembershipId_idx" ON "Incident"("reportedByMembershipId");

-- CreateIndex
CREATE INDEX "IncidentFollowUp_authorMembershipId_idx" ON "IncidentFollowUp"("authorMembershipId");

-- CreateIndex
CREATE INDEX "LostFoundItem_loggedByMembershipId_idx" ON "LostFoundItem"("loggedByMembershipId");

-- CreateIndex
CREATE INDEX "LostPersonAck_membershipId_idx" ON "LostPersonAck"("membershipId");

-- CreateIndex
CREATE INDEX "LostPersonAlert_raisedByMembershipId_idx" ON "LostPersonAlert"("raisedByMembershipId");

-- CreateIndex
CREATE INDEX "Registration_recordedByMembershipId_idx" ON "Registration"("recordedByMembershipId");

-- CreateIndex
CREATE INDEX "ShiftAssignment_membershipId_idx" ON "ShiftAssignment"("membershipId");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_requesterMembershipId_idx" ON "ShiftSwapRequest"("requesterMembershipId");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_targetMembershipId_idx" ON "ShiftSwapRequest"("targetMembershipId");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_decidedByMembershipId_idx" ON "ShiftSwapRequest"("decidedByMembershipId");

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMembership" ADD CONSTRAINT "EventMembership_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMembership" ADD CONSTRAINT "EventMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMembership" ADD CONSTRAINT "EventMembership_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "EventMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

