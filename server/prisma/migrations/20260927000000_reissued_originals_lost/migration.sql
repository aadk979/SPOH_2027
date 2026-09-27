-- The lost-card rule (ADR-002 §3, F03-028): a card replaced by a reissue is LOST,
-- not VOIDED. Data only, and only cards that a reissue points at. Reversible by
-- setting the same rows back to VOIDED.
UPDATE "MissionCard"
SET "status" = 'LOST'
WHERE "status" = 'VOIDED'
  AND "id" IN (SELECT "reissuedFromId" FROM "MissionCard" WHERE "reissuedFromId" IS NOT NULL);
