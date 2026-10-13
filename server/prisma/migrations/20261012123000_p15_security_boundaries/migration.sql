-- CreateEnum
CREATE TYPE "IdentityAccountState" AS ENUM ('CREATE_STARTED', 'PROVIDER_READY', 'BOUND');

-- CreateEnum
CREATE TYPE "IdentityInvitationState" AS ENUM ('STARTED', 'ACCEPTED', 'DELIVERY_UNKNOWN', 'NOT_ELIGIBLE');

-- AlterTable
ALTER TABLE "IdempotencyRecord" ADD COLUMN     "requestHash" CHAR(64);

-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN     "authenticatedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ContentVersion" ADD COLUMN     "imageManifest" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "ContentStorageIntent" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "targetEventId" TEXT NOT NULL,
    "objectKeys" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "cleanupAfter" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContentStorageIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Ephemeral shared quota state deliberately does not enter WAL/backups (ADR-003).
CREATE UNLOGGED TABLE "RateLimitCounter" (
    "namespace" TEXT NOT NULL,
    "scopeDigest" CHAR(64) NOT NULL,
    "subjectDigest" CHAR(64) NOT NULL,
    "generation" UUID NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "count" BIGINT NOT NULL DEFAULT 0,
    "previousWindowCount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("namespace","scopeDigest","subjectDigest")
);

-- CreateTable
CREATE TABLE "IdentityAccountOperation" (
    "id" UUID NOT NULL,
    "targetPoolId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "personId" TEXT,
    "plannedPersonId" TEXT NOT NULL,
    "actorPersonId" TEXT NOT NULL,
    "emailDigest" CHAR(64) NOT NULL,
    "profileDigest" CHAR(64) NOT NULL,
    "expectedSubjectDigest" CHAR(64),
    "providerSubject" TEXT,
    "providerUsername" TEXT,
    "state" "IdentityAccountState" NOT NULL DEFAULT 'CREATE_STARTED',
    "generation" UUID NOT NULL,
    "leaseExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "boundAt" TIMESTAMPTZ(3),

    CONSTRAINT "IdentityAccountOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityInvitationAttempt" (
    "id" UUID NOT NULL,
    "targetPoolId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "actorPersonId" TEXT NOT NULL,
    "accountId" UUID,
    "requestDigest" CHAR(64) NOT NULL,
    "state" "IdentityInvitationState" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "IdentityInvitationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidatedMedia" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "issuedByPersonId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "rehearsal" BOOLEAN NOT NULL,
    "sourceEtag" TEXT NOT NULL,
    "sourceVersionId" TEXT,
    "objectKey" TEXT NOT NULL,
    "objectVersionId" TEXT,
    "contentType" TEXT NOT NULL,
    "contentLength" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ValidatedMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentStorageIntent_cleanupAfter_eventId_idx" ON "ContentStorageIntent"("cleanupAfter", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentStorageIntent_eventId_id_key" ON "ContentStorageIntent"("eventId", "id");

-- CreateIndex
CREATE INDEX "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitCounter_namespace_subjectDigest_idx" ON "RateLimitCounter"("namespace", "subjectDigest");

-- CreateIndex
CREATE INDEX "IdentityAccountOperation_state_leaseExpiresAt_idx" ON "IdentityAccountOperation"("state", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "IdentityAccountOperation_organisationId_createdAt_idx" ON "IdentityAccountOperation"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityAccountOperation_targetPoolId_emailDigest_key" ON "IdentityAccountOperation"("targetPoolId", "emailDigest");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityAccountOperation_targetPoolId_personId_key" ON "IdentityAccountOperation"("targetPoolId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityInvitationAttempt_requestDigest_key" ON "IdentityInvitationAttempt"("requestDigest");

-- CreateIndex
CREATE INDEX "IdentityInvitationAttempt_personId_startedAt_idx" ON "IdentityInvitationAttempt"("personId", "startedAt");

-- CreateIndex
CREATE INDEX "IdentityInvitationAttempt_organisationId_startedAt_idx" ON "IdentityInvitationAttempt"("organisationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ValidatedMedia_key_key" ON "ValidatedMedia"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ValidatedMedia_objectKey_key" ON "ValidatedMedia"("objectKey");

-- CreateIndex
CREATE INDEX "ValidatedMedia_eventId_key_idx" ON "ValidatedMedia"("eventId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ValidatedMedia_eventId_id_key" ON "ValidatedMedia"("eventId", "id");

-- AddForeignKey
ALTER TABLE "ContentStorageIntent" ADD CONSTRAINT "ContentStorageIntent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "IdentityAccountOperation" ADD CONSTRAINT "IdentityAccountOperation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityAccountOperation" ADD CONSTRAINT "IdentityAccountOperation_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityAccountOperation" ADD CONSTRAINT "IdentityAccountOperation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityInvitationAttempt" ADD CONSTRAINT "IdentityInvitationAttempt_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityInvitationAttempt" ADD CONSTRAINT "IdentityInvitationAttempt_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityInvitationAttempt" ADD CONSTRAINT "IdentityInvitationAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "IdentityAccountOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityInvitationAttempt" ADD CONSTRAINT "IdentityInvitationAttempt_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidatedMedia" ADD CONSTRAINT "ValidatedMedia_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ValidatedMedia" ADD CONSTRAINT "ValidatedMedia_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fingerprints are operational equality proofs, never plaintext retry bodies.
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_requestHash_check"
  CHECK ("requestHash" IS NULL OR "requestHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "RateLimitCounter" ADD CONSTRAINT "RateLimitCounter_bounds_check"
  CHECK (length("namespace") BETWEEN 1 AND 64 AND "scopeDigest" ~ '^[a-f0-9]{64}$'
    AND "subjectDigest" ~ '^[a-f0-9]{64}$' AND "count" >= 0 AND "previousWindowCount" >= 0
    AND "expiresAt" > "windowStart");
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_imageManifest_array_check"
  CHECK (jsonb_typeof("imageManifest") = 'array');
-- The existing content_version_immutable trigger rejects every UPDATE, including imageManifest.
ALTER TABLE "ContentStorageIntent" ADD CONSTRAINT "ContentStorageIntent_bounds_check"
  CHECK (length("targetEventId") BETWEEN 1 AND 128 AND length("contentVersionId") BETWEEN 1 AND 128
    AND "objectKeys" IS NOT NULL AND array_position("objectKeys", NULL) IS NULL
    AND cardinality("objectKeys") <= 256 AND "cleanupAfter" > "createdAt");
ALTER TABLE "IdentityAccountOperation" ADD CONSTRAINT "IdentityAccountOperation_proof_check"
  CHECK (length("targetPoolId") BETWEEN 1 AND 128 AND "emailDigest" ~ '^[a-f0-9]{64}$'
    AND "profileDigest" ~ '^[a-f0-9]{64}$'
    AND ("expectedSubjectDigest" IS NULL OR "expectedSubjectDigest" ~ '^[a-f0-9]{64}$')
    AND ("personId" IS NULL OR "personId" = "plannedPersonId")
    AND ("state" = 'CREATE_STARTED' OR ("providerSubject" IS NOT NULL AND "providerUsername" IS NOT NULL
      AND length("providerSubject") > 0 AND length("providerUsername") > 0))
    AND ("state" <> 'BOUND' OR ("personId" IS NOT NULL AND "boundAt" IS NOT NULL)));
ALTER TABLE "IdentityInvitationAttempt" ADD CONSTRAINT "IdentityInvitationAttempt_state_check"
  CHECK (length("targetPoolId") BETWEEN 1 AND 128 AND "requestDigest" ~ '^[a-f0-9]{64}$'
    AND (("state" = 'STARTED' AND "finishedAt" IS NULL)
      OR ("state" <> 'STARTED' AND "finishedAt" IS NOT NULL AND "finishedAt" >= "startedAt")));
ALTER TABLE "ValidatedMedia" ADD CONSTRAINT "ValidatedMedia_proof_check"
  CHECK ("contentLength" > 0 AND "sha256" ~ '^[a-f0-9]{64}$'
    AND length("sourceEtag") > 0 AND length("objectKey") > 0
    AND "contentType" IN ('image/jpeg', 'image/png', 'image/webp'));

CREATE FUNCTION immutable_validated_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Validated media proof is immutable' USING ERRCODE = '55000'; END;
$$;
CREATE TRIGGER validated_media_immutable BEFORE UPDATE ON "ValidatedMedia"
  FOR EACH ROW EXECUTE FUNCTION immutable_validated_media();

CREATE FUNCTION fence_identity_account_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW."targetPoolId", NEW."organisationId", NEW."plannedPersonId", NEW."emailDigest",
      NEW."profileDigest", NEW."expectedSubjectDigest", NEW."createdAt") IS DISTINCT FROM
    ROW(OLD.id, OLD."targetPoolId", OLD."organisationId", OLD."plannedPersonId", OLD."emailDigest",
      OLD."profileDigest", OLD."expectedSubjectDigest", OLD."createdAt")
    OR (OLD.state = 'BOUND' AND NEW IS DISTINCT FROM OLD)
    OR (OLD.state = 'PROVIDER_READY' AND NEW.state = 'CREATE_STARTED')
    OR (OLD.state = 'CREATE_STARTED' AND NEW.state = 'BOUND')
    OR (OLD.state <> 'CREATE_STARTED' AND ROW(NEW."providerSubject", NEW."providerUsername")
      IS DISTINCT FROM ROW(OLD."providerSubject", OLD."providerUsername")) THEN
    RAISE EXCEPTION 'Identity account intent or completed progress is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER identity_account_progress BEFORE UPDATE ON "IdentityAccountOperation"
  FOR EACH ROW EXECUTE FUNCTION fence_identity_account_progress();

CREATE FUNCTION fence_identity_invitation_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.state <> 'STARTED' OR ROW(NEW.id, NEW."targetPoolId", NEW."organisationId",
      NEW."personId", NEW."actorPersonId", NEW."accountId", NEW."requestDigest", NEW."startedAt")
    IS DISTINCT FROM ROW(OLD.id, OLD."targetPoolId", OLD."organisationId", OLD."personId", OLD."actorPersonId",
      OLD."accountId", OLD."requestDigest", OLD."startedAt")) THEN
    RAISE EXCEPTION 'Invitation intent and terminal outcome are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."accountId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "IdentityAccountOperation" a
    WHERE a.id = NEW."accountId" AND a.state = 'BOUND' AND a."targetPoolId" = NEW."targetPoolId"
      AND a."organisationId" = NEW."organisationId" AND a."personId" = NEW."personId") THEN
    RAISE EXCEPTION 'Invitation requires its exact bound account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER identity_invitation_progress BEFORE INSERT OR UPDATE ON "IdentityInvitationAttempt"
  FOR EACH ROW EXECUTE FUNCTION fence_identity_invitation_progress();
