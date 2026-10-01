-- P09.10, contract: an assignment is on a shift (a day and a template), and
-- the shift hours are the templates' (ADR-002). Every writer has set shiftId
-- since P09.5; a row still without one is resolved from its day and block.
UPDATE "ShiftAssignment" a SET "shiftId" = s."id"
FROM "Shift" s JOIN "ShiftTemplate" t ON t."id" = s."templateId"
WHERE a."shiftId" IS NULL AND s."eventDayId" = a."eventDayId" AND t."code" = a."block"::text;

ALTER TABLE "ShiftAssignment" ALTER COLUMN "shiftId" SET NOT NULL;
DROP INDEX "ShiftAssignment_volunteerId_eventDayId_block_key";
DROP INDEX "ShiftAssignment_stationId_eventDayId_block_idx";
ALTER TABLE "ShiftAssignment" DROP COLUMN "block";
DROP TYPE "ShiftBlock";
CREATE UNIQUE INDEX "ShiftAssignment_volunteerId_shiftId_key" ON "ShiftAssignment"("volunteerId", "shiftId");
CREATE INDEX "ShiftAssignment_stationId_shiftId_idx" ON "ShiftAssignment"("stationId", "shiftId");

-- The hours live on the templates now; the old setting row would only be
-- logged and ignored on every boot.
DELETE FROM "AppSetting" WHERE "key" = 'shiftBlocks';
