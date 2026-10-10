-- Attribution and the current publication are real references, not scalar conventions.
-- Existing invalid rows cause deployment to fail; do not rewrite or erase their evidence.
ALTER TABLE "ContentDocument"
  ADD CONSTRAINT "ContentDocument_updatedByPersonId_fkey"
    FOREIGN KEY ("updatedByPersonId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContentDocument_reviewedByPersonId_fkey"
    FOREIGN KEY ("reviewedByPersonId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ContentDocument_eventId_publishedVersionId_fkey"
    FOREIGN KEY ("eventId", "publishedVersionId") REFERENCES "ContentVersion"("eventId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContentVersion"
  ADD CONSTRAINT "ContentVersion_publishedByPersonId_fkey"
    FOREIGN KEY ("publishedByPersonId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContentUploadReceipt"
  ADD CONSTRAINT "ContentUploadReceipt_issuedByPersonId_fkey"
    FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- A one-minute handoff cannot outlive the session it would redeem.
ALTER TABLE "AuthHandoff"
  ADD CONSTRAINT "AuthHandoff_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "RefreshSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AuthHandoff_sessionId_idx" ON "AuthHandoff"("sessionId");
