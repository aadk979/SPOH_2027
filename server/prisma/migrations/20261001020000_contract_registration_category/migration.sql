-- P09.10, contract: a registration's category is the event's CaptureCategory,
-- by id (ADR-002). Every writer has filled categoryId since P09.5; any row the
-- backfill missed is resolved from its code first, so SET NOT NULL cannot drop
-- a count. Irreversible from here: the enum column and type go.
UPDATE "Registration" r
SET "categoryId" = c."id"
FROM "CaptureCategory" c
WHERE r."categoryId" IS NULL
  AND c."eventId" = r."eventId"
  AND c."code" = r."category"::text;

ALTER TABLE "Registration" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Registration" DROP COLUMN "category";
DROP TYPE "VisitorCategory";
