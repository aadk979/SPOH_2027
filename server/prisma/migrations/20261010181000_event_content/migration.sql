CREATE TABLE "ContentDocument" (
  "id" TEXT NOT NULL PRIMARY KEY, "eventId" TEXT NOT NULL UNIQUE,
  "body" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "reviewedVersion" INTEGER, "reviewedAt" TIMESTAMPTZ(3), "reviewedByPersonId" TEXT,
  "publishedVersionId" TEXT, "updatedByPersonId" TEXT NOT NULL, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ContentDocument_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT,
  CONSTRAINT "ContentDocument_version_check" CHECK ("version" > 0),
  CONSTRAINT "ContentDocument_review_check" CHECK ("reviewedVersion" IS NULL OR "reviewedVersion" = "version")
);
CREATE UNIQUE INDEX "ContentDocument_eventId_id_key" ON "ContentDocument"("eventId", "id");
CREATE TABLE "ContentVersion" (
  "id" TEXT NOT NULL PRIMARY KEY, "eventId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "draftVersion" INTEGER NOT NULL, "body" JSONB NOT NULL, "objectKey" TEXT NOT NULL UNIQUE,
  "etag" TEXT NOT NULL, "publishedByPersonId" TEXT NOT NULL, "publishedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ContentVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT,
  CONSTRAINT "ContentVersion_version_check" CHECK ("version" > 0 AND "draftVersion" > 0)
);
CREATE UNIQUE INDEX "ContentVersion_eventId_id_key" ON "ContentVersion"("eventId", "id");
CREATE UNIQUE INDEX "ContentVersion_eventId_version_key" ON "ContentVersion"("eventId", "version");
CREATE INDEX "ContentVersion_eventId_publishedAt_idx" ON "ContentVersion"("eventId", "publishedAt");
CREATE TABLE "ContentUploadReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY, "eventId" TEXT NOT NULL, "key" TEXT NOT NULL UNIQUE,
  "contentType" TEXT NOT NULL, "contentLength" INTEGER NOT NULL,
  "issuedByPersonId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ContentUploadReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT,
  CONSTRAINT "ContentUploadReceipt_size_check" CHECK ("contentLength" > 0 AND "contentLength" <= 1048576)
);
CREATE UNIQUE INDEX "ContentUploadReceipt_eventId_id_key" ON "ContentUploadReceipt"("eventId", "id");
CREATE INDEX "ContentUploadReceipt_eventId_key_idx" ON "ContentUploadReceipt"("eventId", "key");
CREATE FUNCTION reject_content_version_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published content is immutable'; END;
$$;
CREATE TRIGGER content_version_immutable BEFORE UPDATE ON "ContentVersion"
FOR EACH ROW EXECUTE FUNCTION reject_content_version_mutation();
