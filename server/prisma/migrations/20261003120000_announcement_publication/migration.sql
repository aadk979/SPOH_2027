-- CreateTable
CREATE TABLE "AnnouncementPublication" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "announcementId" TEXT NOT NULL,
    "scheduledActionId" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AnnouncementPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementPublication_eventId_publishedAt_idx" ON "AnnouncementPublication"("eventId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPublication_eventId_id_key" ON "AnnouncementPublication"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPublication_eventId_draftId_key" ON "AnnouncementPublication"("eventId", "draftId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPublication_eventId_draftId_version_key" ON "AnnouncementPublication"("eventId", "draftId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPublication_eventId_announcementId_key" ON "AnnouncementPublication"("eventId", "announcementId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementPublication_eventId_scheduledActionId_key" ON "AnnouncementPublication"("eventId", "scheduledActionId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDraft_eventId_id_version_key" ON "AnnouncementDraft"("eventId", "id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAction_eventId_id_key" ON "ScheduledAction"("eventId", "id");

-- AddForeignKey
ALTER TABLE "AnnouncementPublication" ADD CONSTRAINT "AnnouncementPublication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementPublication" ADD CONSTRAINT "AnnouncementPublication_eventId_draftId_version_fkey" FOREIGN KEY ("eventId", "draftId", "version") REFERENCES "AnnouncementDraft"("eventId", "id", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AnnouncementPublication" ADD CONSTRAINT "AnnouncementPublication_eventId_announcementId_fkey" FOREIGN KEY ("eventId", "announcementId") REFERENCES "Announcement"("eventId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AnnouncementPublication" ADD CONSTRAINT "AnnouncementPublication_eventId_scheduledActionId_fkey" FOREIGN KEY ("eventId", "scheduledActionId") REFERENCES "ScheduledAction"("eventId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "AnnouncementPublication" ADD CONSTRAINT "AnnouncementPublication_version"
  CHECK (version >= 1);

CREATE FUNCTION immutable_announcement_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Announcement publications are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER announcement_publication_immutable BEFORE UPDATE ON "AnnouncementPublication"
  FOR EACH ROW EXECUTE FUNCTION immutable_announcement_publication();

CREATE FUNCTION immutable_published_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AnnouncementPublication" WHERE "eventId" = OLD."eventId" AND "draftId" = OLD.id) THEN
    RAISE EXCEPTION 'Published drafts are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER published_draft_immutable BEFORE UPDATE ON "AnnouncementDraft"
  FOR EACH ROW EXECUTE FUNCTION immutable_published_draft();

-- Extend the existing protection in a new migration: INFO publications are immutable too.
CREATE OR REPLACE FUNCTION immutable_planned_announcement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AnnouncementDeliveryPlan" WHERE "eventId" = OLD."eventId" AND "announcementId" = OLD.id)
     OR EXISTS (SELECT 1 FROM "AnnouncementPublication" WHERE "eventId" = OLD."eventId" AND "announcementId" = OLD.id) THEN
    RAISE EXCEPTION 'Published or planned announcements are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
