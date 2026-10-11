CREATE TABLE "CardPrintExport" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "rehearsal" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CardPrintExport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CardPrintExport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CardPrintExport_format_check" CHECK ("format" IN ('pdf', 'zip')),
  CONSTRAINT "CardPrintExport_count_check" CHECK ("count" BETWEEN 1 AND 5000)
);
CREATE UNIQUE INDEX "CardPrintExport_objectKey_key" ON "CardPrintExport"("objectKey");
CREATE UNIQUE INDEX "CardPrintExport_eventId_id_key" ON "CardPrintExport"("eventId", "id");
CREATE INDEX "CardPrintExport_eventId_createdAt_id_idx" ON "CardPrintExport"("eventId", "createdAt", "id");
