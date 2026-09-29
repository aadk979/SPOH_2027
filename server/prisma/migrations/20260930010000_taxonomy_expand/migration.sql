-- P09.2, expand (ADR-002 §1): the event taxonomy becomes data. New tables for
-- capture categories, station types (with the capability flags), station tags,
-- shift templates and materialised shifts, all event-owned. Nullable categoryId,
-- typeId and shiftId sit beside the enum columns, which stay authoritative
-- until P09.5 switches reads and writes. Reversible by dropping the new tables
-- and columns.

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "ShiftAssignment" ADD COLUMN     "shiftId" TEXT;

-- AlterTable
ALTER TABLE "Station" ADD COLUMN     "typeId" TEXT;

-- CreateTable
CREATE TABLE "CaptureCategory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CaptureCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationType" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "registersVisitors" BOOLEAN NOT NULL DEFAULT false,
    "countsEntry" BOOLEAN NOT NULL DEFAULT false,
    "issuesStamp" BOOLEAN NOT NULL DEFAULT false,
    "redeemsGifts" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationTag" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StationTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationTagging" (
    "eventId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "StationTagging_pkey" PRIMARY KEY ("stationId","tagId")
);

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "endsNextDay" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaptureCategory_eventId_active_sortOrder_idx" ON "CaptureCategory"("eventId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CaptureCategory_eventId_code_key" ON "CaptureCategory"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CaptureCategory_eventId_id_key" ON "CaptureCategory"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StationType_eventId_code_key" ON "StationType"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StationType_eventId_id_key" ON "StationType"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StationTag_eventId_code_key" ON "StationTag"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StationTag_eventId_id_key" ON "StationTag"("eventId", "id");

-- CreateIndex
CREATE INDEX "StationTagging_eventId_tagId_idx" ON "StationTagging"("eventId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftTemplate_eventId_code_key" ON "ShiftTemplate"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftTemplate_eventId_id_key" ON "ShiftTemplate"("eventId", "id");

-- CreateIndex
CREATE INDEX "Shift_eventId_startsAt_endsAt_idx" ON "Shift"("eventId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_eventDayId_templateId_key" ON "Shift"("eventDayId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_eventId_id_key" ON "Shift"("eventId", "id");

-- CreateIndex
CREATE INDEX "Registration_eventId_categoryId_recordedAt_idx" ON "Registration"("eventId", "categoryId", "recordedAt");

-- CreateIndex
CREATE INDEX "ShiftAssignment_shiftId_idx" ON "ShiftAssignment"("shiftId");

-- CreateIndex
CREATE INDEX "Station_eventId_typeId_active_idx" ON "Station"("eventId", "typeId", "active");

-- AddForeignKey
ALTER TABLE "CaptureCategory" ADD CONSTRAINT "CaptureCategory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationType" ADD CONSTRAINT "StationType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTag" ADD CONSTRAINT "StationTag_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTagging" ADD CONSTRAINT "StationTagging_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTagging" ADD CONSTRAINT "StationTagging_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTagging" ADD CONSTRAINT "StationTagging_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StationTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ShiftTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "StationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CaptureCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

