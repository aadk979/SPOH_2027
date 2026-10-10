ALTER TABLE "Person" ADD COLUMN "deactivatedAt" TIMESTAMPTZ(3);
-- Refuse duplicate legacy addresses rather than silently merging real identities.
CREATE UNIQUE INDEX "Person_email_lower_key" ON "Person" (lower("email"));
ALTER TABLE "EventMembership" ADD COLUMN "personSuspendedStatus" "MembershipStatus";
ALTER TABLE "RefreshSession" ADD COLUMN "replacedById" TEXT,
 ADD COLUMN "absoluteExpiresAt" TIMESTAMPTZ(3),
 ADD COLUMN "mfaPending" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "providerTokenEncrypted" TEXT,
 ADD COLUMN "providerTokenExpiresAt" TIMESTAMPTZ(3);
CREATE TABLE "AuthHandoff" (
 "id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "challenge" TEXT NOT NULL,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL, "consumedAt" TIMESTAMPTZ(3)
);
CREATE INDEX "AuthHandoff_expiresAt_idx" ON "AuthHandoff"("expiresAt");
