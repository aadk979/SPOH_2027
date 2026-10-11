ALTER TABLE "CardPrintExport" ADD COLUMN "shortCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CardPrintExport" ADD COLUMN "printContext" JSONB NOT NULL DEFAULT '{}'::JSONB;
-- Empty means an older export has no recorded membership; never infer it from later card rows.
ALTER TABLE "CardPrintExport" ADD CONSTRAINT "CardPrintExport_membership_count_check"
  CHECK (cardinality("shortCodes") = 0 OR cardinality("shortCodes") = "count");
