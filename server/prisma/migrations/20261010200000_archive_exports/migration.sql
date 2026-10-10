CREATE TABLE "ArchiveExport" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "lifecycleVersion" INTEGER NOT NULL,
  "objectKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ArchiveExport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArchiveExport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArchiveExport_eventId_snapshotId_fkey" FOREIGN KEY ("eventId", "snapshotId") REFERENCES "ReportSnapshot"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ArchiveExport_objectKey_key" ON "ArchiveExport"("objectKey");
CREATE UNIQUE INDEX "ArchiveExport_eventId_id_key" ON "ArchiveExport"("eventId", "id");
CREATE INDEX "ArchiveExport_eventId_lifecycleVersion_idx" ON "ArchiveExport"("eventId", "lifecycleVersion");
