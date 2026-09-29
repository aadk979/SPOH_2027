-- A redemption synced from a phone's offline queue has already happened: the gift
-- is in the visitor's hands. One that breaks the stock or one-per-journey rule is
-- recorded with a flag for the IC instead of refused (ADR-007 §5, F03-034).
-- Additive only: a nullable column and an index. Reversible by dropping both.
CREATE TYPE "RedemptionFlag" AS ENUM ('OVER_STOCK', 'SECOND_GIFT');

ALTER TABLE "GiftRedemption" ADD COLUMN "flag" "RedemptionFlag";

CREATE INDEX "GiftRedemption_flag_recordedAt_idx" ON "GiftRedemption"("flag", "recordedAt");
