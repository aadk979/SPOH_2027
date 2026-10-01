-- P09.14: visitor personal data in allowlist mode (ADR-002 §4). The event's
-- declared fields, and each registration's values apart from every count;
-- Event.closedAt starts the retention clock. Generated with prisma migrate diff.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "closedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "VisitorField" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "readers" "CommitteeRole"[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VisitorField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorRecord" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "purgeAfter" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorField_eventId_code_key" ON "VisitorField"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorField_eventId_id_key" ON "VisitorField"("eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorRecord_registrationId_key" ON "VisitorRecord"("registrationId");

-- CreateIndex
CREATE INDEX "VisitorRecord_eventId_createdAt_idx" ON "VisitorRecord"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "VisitorRecord_eventId_purgeAfter_idx" ON "VisitorRecord"("eventId", "purgeAfter");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorRecord_eventId_registrationId_key" ON "VisitorRecord"("eventId", "registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_eventId_id_key" ON "Registration"("eventId", "id");

-- AddForeignKey
ALTER TABLE "VisitorField" ADD CONSTRAINT "VisitorField_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorRecord" ADD CONSTRAINT "VisitorRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorRecord" ADD CONSTRAINT "VisitorRecord_eventId_registrationId_fkey" FOREIGN KEY ("eventId", "registrationId") REFERENCES "Registration"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
