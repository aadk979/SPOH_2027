-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('ANNOUNCEMENT_PUBLISHED', 'LOST_PERSON_RAISED', 'LOST_PERSON_RESOLVED', 'ASSIGNMENT_CHANGED', 'ASSIGNMENT_REMOVED', 'SWAP_APPROVED', 'SWAP_REJECTED', 'SWAP_CANCELLED', 'FALLBACK_REMINDER', 'ARCHIVE_REMINDER', 'INCIDENT_RAISED', 'GIFT_LOW_STOCK');

-- CreateEnum
CREATE TYPE "NoticeSourceKind" AS ENUM ('ANNOUNCEMENT', 'LOST_PERSON', 'ASSIGNMENT', 'SWAP', 'FALLBACK', 'EVENT', 'INCIDENT', 'GIFT');

-- CreateEnum
CREATE TYPE "NoticeDeliveryStatus" AS ENUM ('PENDING', 'RUNNING', 'SENT', 'SKIPPED', 'DEAD');

-- CreateEnum
CREATE TYPE "NoticeDeliveryError" AS ENUM ('UNCONFIGURED', 'PUSH_DISABLED', 'RECIPIENT_INACTIVE', 'RECIPIENT_OUT_OF_SCOPE', 'SUBSCRIPTION_GONE', 'SUBSCRIPTION_REASSIGNED', 'EXPIRED', 'ARCHIVED', 'SOURCE_UNAVAILABLE', 'SOURCE_CHANGED', 'PUSH_FAILED', 'RETRY_EXHAUSTED');

-- AlterEnum
ALTER TYPE "AnnouncementPushDeliveryError" ADD VALUE 'PUSH_DISABLED';

-- AlterTable
ALTER TABLE "FootfallTick" ADD COLUMN     "importBatchId" TEXT;

-- AlterTable
ALTER TABLE "GiftRedemption" ADD COLUMN     "voidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "voidedReason" TEXT;

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "fallbackWindowId" TEXT,
ADD COLUMN     "provenanceVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "undoReason" TEXT,
ADD COLUMN     "undoneAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "importBatchId" TEXT;

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipientPersonId" TEXT NOT NULL,
    "recipientMembershipId" TEXT,
    "kind" "NoticeKind" NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL,
    "sourceKind" "NoticeSourceKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticePreference" (
    "personId" TEXT NOT NULL,
    "urgentPush" BOOLEAN NOT NULL DEFAULT true,
    "operationalPush" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NoticePreference_pkey" PRIMARY KEY ("personId")
);

-- CreateTable
CREATE TABLE "NoticeDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "recipientPersonId" TEXT NOT NULL,
    "membershipId" TEXT,
    "subscriptionId" TEXT,
    "deviceKey" TEXT NOT NULL,
    "status" "NoticeDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "lastError" "NoticeDeliveryError",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notice_eventId_recipientPersonId_createdAt_id_idx" ON "Notice"("eventId", "recipientPersonId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notice_recipientPersonId_readAt_createdAt_id_idx" ON "Notice"("recipientPersonId", "readAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notice_eventId_id_key" ON "Notice"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notice_eventId_recipientPersonId_transitionKey_key" ON "Notice"("eventId", "recipientPersonId", "transitionKey");

-- CreateIndex
CREATE INDEX "NoticeDelivery_status_runAt_idx" ON "NoticeDelivery"("status", "runAt");

-- CreateIndex
CREATE INDEX "NoticeDelivery_eventId_noticeId_idx" ON "NoticeDelivery"("eventId", "noticeId");

-- CreateIndex
CREATE INDEX "NoticeDelivery_membershipId_idx" ON "NoticeDelivery"("membershipId");

-- CreateIndex
CREATE INDEX "NoticeDelivery_subscriptionId_idx" ON "NoticeDelivery"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeDelivery_eventId_id_key" ON "NoticeDelivery"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeDelivery_noticeId_deviceKey_key" ON "NoticeDelivery"("noticeId", "deviceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FallbackWindow_eventId_id_key" ON "FallbackWindow"("eventId", "id");

-- CreateIndex
CREATE INDEX "FootfallTick_eventId_importBatchId_recordedAt_idx" ON "FootfallTick"("eventId", "importBatchId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_eventId_id_key" ON "ImportBatch"("eventId", "id");

-- CreateIndex
CREATE INDEX "Registration_eventId_importBatchId_recordedAt_idx" ON "Registration"("eventId", "importBatchId", "recordedAt");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_importBatchId_fkey" FOREIGN KEY ("eventId", "importBatchId") REFERENCES "ImportBatch"("eventId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FootfallTick" ADD CONSTRAINT "FootfallTick_eventId_importBatchId_fkey" FOREIGN KEY ("eventId", "importBatchId") REFERENCES "ImportBatch"("eventId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_eventId_fallbackWindowId_fkey" FOREIGN KEY ("eventId", "fallbackWindowId") REFERENCES "FallbackWindow"("eventId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_recipientPersonId_fkey" FOREIGN KEY ("recipientPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_eventId_recipientMembershipId_fkey" FOREIGN KEY ("eventId", "recipientMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticePreference" ADD CONSTRAINT "NoticePreference_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_eventId_noticeId_fkey" FOREIGN KEY ("eventId", "noticeId") REFERENCES "Notice"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_recipientPersonId_fkey" FOREIGN KEY ("recipientPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_eventId_membershipId_fkey" FOREIGN KEY ("eventId", "membershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Persist bounded retries and known import provenance. Existing imports remain
-- version 0: a timestamp or filename is never inferred as exact row ownership.
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_retry_bounds"
  CHECK ("maxAttempts" BETWEEN 1 AND 10 AND attempts BETWEEN 0 AND "maxAttempts" AND version >= 0);
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_provenance_bounds"
  CHECK ("provenanceVersion" IN (0, 1) AND "rowCount" >= 0);
