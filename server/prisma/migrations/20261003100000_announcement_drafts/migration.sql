-- CreateTable
CREATE TABLE "AnnouncementDraft" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorMembershipId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'INFO',
    "targetRole" "CommitteeRole",
    "targetStationId" TEXT,
    "targetEventDayId" TEXT,
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementDraft_eventId_authorId_updatedAt_idx" ON "AnnouncementDraft"("eventId", "authorId", "updatedAt");

-- CreateIndex
CREATE INDEX "AnnouncementDraft_authorMembershipId_idx" ON "AnnouncementDraft"("authorMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDraft_eventId_id_key" ON "AnnouncementDraft"("eventId", "id");

-- AddForeignKey
ALTER TABLE "AnnouncementDraft" ADD CONSTRAINT "AnnouncementDraft_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDraft" ADD CONSTRAINT "AnnouncementDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDraft" ADD CONSTRAINT "AnnouncementDraft_eventId_authorMembershipId_fkey" FOREIGN KEY ("eventId", "authorMembershipId") REFERENCES "EventMembership"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDraft" ADD CONSTRAINT "AnnouncementDraft_eventId_targetStationId_fkey" FOREIGN KEY ("eventId", "targetStationId") REFERENCES "Station"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDraft" ADD CONSTRAINT "AnnouncementDraft_eventId_targetEventDayId_fkey" FOREIGN KEY ("eventId", "targetEventDayId") REFERENCES "EventDay"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
