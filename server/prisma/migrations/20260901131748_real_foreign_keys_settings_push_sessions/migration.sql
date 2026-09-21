-- ─────────────────────────────────────────────────────────────────────────────
-- Reconcile before constraining.
--
-- Twelve columns below held an id by convention only. Adding the real foreign
-- keys fails on any row whose id no longer resolves, so those rows are dealt
-- with first, deterministically, rather than leaving the migration to fail
-- halfway through on whichever database happens to have one.
--
-- Nullable references are set to NULL: the row is still meaningful without the
-- link. Non-nullable references are deleted, because a stock adjustment or a
-- fallback declaration with no actor is exactly the record that cannot be
-- trusted during reconciliation — keeping it would be worse than losing it, and
-- it is unreferencable either way.
--
-- On a correctly-populated database every statement here affects zero rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- Nullable: keep the row, drop the dangling link.
UPDATE "ShiftSwapRequest" s SET "decidedById" = NULL
  WHERE s."decidedById" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Volunteer" v WHERE v.id = s."decidedById");

UPDATE "LostFoundItem" l SET "foundStationId" = NULL
  WHERE l."foundStationId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Station" st WHERE st.id = l."foundStationId");

UPDATE "Announcement" a SET "targetStationId" = NULL
  WHERE a."targetStationId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Station" st WHERE st.id = a."targetStationId");

UPDATE "Announcement" a SET "targetEventDayId" = NULL
  WHERE a."targetEventDayId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "EventDay" d WHERE d.id = a."targetEventDayId");

UPDATE "FallbackWindow" f SET "stationId" = NULL
  WHERE f."stationId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Station" st WHERE st.id = f."stationId");

UPDATE "AuditLog" al SET "actorId" = NULL
  WHERE al."actorId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Volunteer" v WHERE v.id = al."actorId");

-- Non-nullable: the row cannot exist without its actor.
DELETE FROM "GiftStockAdjustment" g
  WHERE NOT EXISTS (SELECT 1 FROM "Volunteer" v WHERE v.id = g."createdById");

DELETE FROM "IncidentFollowUp" i
  WHERE NOT EXISTS (SELECT 1 FROM "Volunteer" v WHERE v.id = i."authorId");

DELETE FROM "LostPersonAck" a
  WHERE NOT EXISTS (SELECT 1 FROM "Volunteer" v WHERE v.id = a."volunteerId");

DELETE FROM "AnnouncementAck" a
  WHERE NOT EXISTS (SELECT 1 FROM "Volunteer" v WHERE v.id = a."volunteerId");

DELETE FROM "FallbackWindow" f
  WHERE NOT EXISTS (SELECT 1 FROM "Volunteer" v WHERE v.id = f."declaredById");

DELETE FROM "ImportBatch" b
  WHERE NOT EXISTS (SELECT 1 FROM "Volunteer" v WHERE v.id = b."importedById");

-- DropForeignKey
ALTER TABLE "AnnouncementAck" DROP CONSTRAINT "AnnouncementAck_announcementId_fkey";

-- DropForeignKey
ALTER TABLE "IncidentFollowUp" DROP CONSTRAINT "IncidentFollowUp_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "LostPersonAck" DROP CONSTRAINT "LostPersonAck_alertId_fkey";

-- DropForeignKey
ALTER TABLE "ShiftSwapRequest" DROP CONSTRAINT "ShiftSwapRequest_assignmentId_fkey";

-- AlterTable
ALTER TABLE "Volunteer" ADD COLUMN     "deactivatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deactivatedReason" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_volunteerId_idx" ON "PushSubscription"("volunteerId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_volunteerId_revokedAt_idx" ON "RefreshSession"("volunteerId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshSession_familyId_idx" ON "RefreshSession"("familyId");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "FallbackWindow_endedAt_idx" ON "FallbackWindow"("endedAt");

-- CreateIndex
CREATE INDEX "GiftStockAdjustment_giftTypeId_createdAt_idx" ON "GiftStockAdjustment"("giftTypeId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_importedAt_idx" ON "ImportBatch"("importedAt");

-- CreateIndex
CREATE INDEX "LostFoundItem_foundAt_idx" ON "LostFoundItem"("foundAt");

-- CreateIndex
CREATE INDEX "Volunteer_active_displayName_idx" ON "Volunteer"("active", "displayName");

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ShiftAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftStockAdjustment" ADD CONSTRAINT "GiftStockAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAck" ADD CONSTRAINT "LostPersonAck_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "LostPersonAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostPersonAck" ADD CONSTRAINT "LostPersonAck_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_foundStationId_fkey" FOREIGN KEY ("foundStationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_targetStationId_fkey" FOREIGN KEY ("targetStationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_targetEventDayId_fkey" FOREIGN KEY ("targetEventDayId") REFERENCES "EventDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAck" ADD CONSTRAINT "AnnouncementAck_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementAck" ADD CONSTRAINT "AnnouncementAck_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FallbackWindow" ADD CONSTRAINT "FallbackWindow_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FallbackWindow" ADD CONSTRAINT "FallbackWindow_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
