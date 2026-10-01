-- P09.10, contract (ADR-001 Migration step 4): a person is an identity; what
-- they are in an event (role, portfolio, reporting line, standing) is their
-- membership of it, which every read has used since P09.5 and every write has
-- mirrored. The Person columns go, and the table takes the model's name.

-- An administrator with no event yet (the production seed) keeps their
-- standing as a platform administrator of the organisation; everyone else's
-- role already lives on their memberships.
INSERT INTO "OrganisationMembership" ("id", "organisationId", "personId", "role", "updatedAt")
SELECT 'om_' || md5(o."id" || v."id"), o."id", v."id", 'PLATFORM_ADMIN', CURRENT_TIMESTAMP
FROM "Volunteer" v
CROSS JOIN (SELECT "id" FROM "Organisation" ORDER BY "createdAt" LIMIT 1) o
WHERE v."role" = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM "EventMembership" m WHERE m."personId" = v."id")
ON CONFLICT ("organisationId", "personId") DO UPDATE SET "role" = 'PLATFORM_ADMIN';

DROP INDEX "Volunteer_role_active_idx";
DROP INDEX "Volunteer_active_displayName_idx";
ALTER TABLE "Volunteer" DROP CONSTRAINT "Volunteer_reportsToId_fkey";
ALTER TABLE "Volunteer"
  DROP COLUMN "role",
  DROP COLUMN "portfolio",
  DROP COLUMN "reportsToId",
  DROP COLUMN "active",
  DROP COLUMN "deactivatedAt",
  DROP COLUMN "deactivatedReason";

ALTER TABLE "Volunteer" RENAME TO "Person";
ALTER TABLE "Person" RENAME CONSTRAINT "Volunteer_pkey" TO "Person_pkey";
ALTER INDEX "Volunteer_cognitoSub_key" RENAME TO "Person_cognitoSub_key";
ALTER INDEX "Volunteer_email_key" RENAME TO "Person_email_key";
CREATE INDEX "Person_displayName_idx" ON "Person"("displayName");
