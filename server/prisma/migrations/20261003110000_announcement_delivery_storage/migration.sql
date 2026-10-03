-- CreateEnum
CREATE TYPE "AnnouncementPushDeliveryStatus" AS ENUM ('PENDING', 'RUNNING', 'SENT', 'SKIPPED', 'DEAD');

-- CreateEnum
CREATE TYPE "AnnouncementPushDeliveryError" AS ENUM ('UNCONFIGURED', 'RECIPIENT_INACTIVE', 'SUBSCRIPTION_GONE', 'SUBSCRIPTION_REASSIGNED', 'EXPIRED', 'ARCHIVED', 'SOURCE_UNAVAILABLE', 'SOURCE_CHANGED', 'PUSH_FAILED', 'RETRY_EXHAUSTED');

-- CreateTable
CREATE TABLE "AnnouncementDeliveryPlan" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "deviceCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AnnouncementDeliveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementPushDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "recipientPersonId" TEXT NOT NULL,
    "recipientMembershipId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "deviceKey" TEXT NOT NULL,
    "status" "AnnouncementPushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMPTZ(3) NOT NULL,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "lastError" "AnnouncementPushDeliveryError",
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AnnouncementPushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementDeliveryPlan_eventId_expiresAt_idx" ON "AnnouncementDeliveryPlan"("eventId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDeliveryPlan_eventId_id_key" ON "AnnouncementDeliveryPlan"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDeliveryPlan_eventId_announcementId_key" ON "AnnouncementDeliveryPlan"("eventId", "announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementPushDelivery_status_runAt_idx" ON "AnnouncementPushDelivery"("status", "runAt");

-- CreateIndex
CREATE INDEX "AnnouncementPushDelivery_eventId_planId_idx" ON "AnnouncementPushDelivery"("eventId", "planId");

-- CreateIndex
CREATE INDEX "AnnouncementPushDelivery_recipientMembershipId_idx" ON "AnnouncementPushDelivery"("recipientMembershipId");

-- CreateIndex
CREATE INDEX "AnnouncementPushDelivery_subscriptionId_idx" ON "AnnouncementPushDelivery"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPushDelivery_eventId_id_key" ON "AnnouncementPushDelivery"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPushDelivery_planId_deviceKey_key" ON "AnnouncementPushDelivery"("planId", "deviceKey");

-- AddForeignKey
ALTER TABLE "AnnouncementDeliveryPlan" ADD CONSTRAINT "AnnouncementDeliveryPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDeliveryPlan" ADD CONSTRAINT "AnnouncementDeliveryPlan_eventId_announcementId_fkey" FOREIGN KEY ("eventId", "announcementId") REFERENCES "Announcement"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPushDelivery" ADD CONSTRAINT "AnnouncementPushDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPushDelivery" ADD CONSTRAINT "AnnouncementPushDelivery_eventId_planId_fkey" FOREIGN KEY ("eventId", "planId") REFERENCES "AnnouncementDeliveryPlan"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPushDelivery" ADD CONSTRAINT "AnnouncementPushDelivery_recipientPersonId_fkey" FOREIGN KEY ("recipientPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPushDelivery" ADD CONSTRAINT "AnnouncementPushDelivery_eventId_recipientMembershipId_fkey" FOREIGN KEY ("eventId", "recipientMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPushDelivery" ADD CONSTRAINT "AnnouncementPushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The audience snapshot is immutable; only device delivery state may advance.
ALTER TABLE "AnnouncementDeliveryPlan" ADD CONSTRAINT "AnnouncementDeliveryPlan_bounds"
  CHECK ("recipientCount" >= 0 AND "deviceCount" >= 0 AND "expiresAt" > "createdAt"
    AND ("deviceCount" = 0 OR "recipientCount" > 0));
ALTER TABLE "AnnouncementPushDelivery" ADD CONSTRAINT "AnnouncementPushDelivery_bounds"
  CHECK ("maxAttempts" BETWEEN 1 AND 20 AND attempts BETWEEN 0 AND "maxAttempts" AND version >= 0);
ALTER TABLE "AnnouncementPushDelivery" ADD CONSTRAINT "AnnouncementPushDelivery_state"
  CHECK ((status = 'RUNNING' AND "lockedBy" IS NOT NULL AND "lockedUntil" IS NOT NULL AND "completedAt" IS NULL)
    OR (status = 'PENDING' AND "lockedBy" IS NULL AND "lockedUntil" IS NULL AND "completedAt" IS NULL)
    OR (status IN ('SENT', 'SKIPPED', 'DEAD') AND "lockedBy" IS NULL AND "lockedUntil" IS NULL AND "completedAt" IS NOT NULL));

CREATE FUNCTION immutable_announcement_delivery_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Announcement delivery plans are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER announcement_delivery_plan_immutable BEFORE UPDATE ON "AnnouncementDeliveryPlan"
  FOR EACH ROW EXECUTE FUNCTION immutable_announcement_delivery_plan();

-- A planned message cannot change its text, targeting or deadline underneath delivery.
CREATE FUNCTION immutable_planned_announcement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AnnouncementDeliveryPlan" WHERE "eventId" = OLD."eventId" AND "announcementId" = OLD.id) THEN
    RAISE EXCEPTION 'Planned announcements are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER planned_announcement_immutable BEFORE UPDATE ON "Announcement"
  FOR EACH ROW EXECUTE FUNCTION immutable_planned_announcement();

-- Keep the recipient/dedup identity fixed. Unsubscribe may null only the live device reference.
CREATE FUNCTION immutable_announcement_delivery_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."eventId", NEW."planId", NEW."recipientPersonId", NEW."recipientMembershipId", NEW."deviceKey", NEW."createdAt", NEW."maxAttempts")
       IS DISTINCT FROM
     ROW(OLD."eventId", OLD."planId", OLD."recipientPersonId", OLD."recipientMembershipId", OLD."deviceKey", OLD."createdAt", OLD."maxAttempts")
     OR (NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId" AND NEW."subscriptionId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Announcement delivery identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER announcement_delivery_identity_immutable BEFORE UPDATE ON "AnnouncementPushDelivery"
  FOR EACH ROW EXECUTE FUNCTION immutable_announcement_delivery_identity();
