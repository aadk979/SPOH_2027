-- Audit log: severity, outcome and transport detail.
--
-- Security events (a refused sign-in, a denied capability, a rate-limit trip)
-- have no mutation to ride along with, so they are written on their own and
-- describe themselves through the transport columns rather than before/after.

CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'NOTICE', 'WARNING', 'CRITICAL');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

ALTER TABLE "AuditLog"
  ADD COLUMN "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
  ADD COLUMN "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "method" TEXT,
  ADD COLUMN "path" TEXT,
  ADD COLUMN "statusCode" INTEGER;

-- Existing rows are all completed changes, which is what the defaults say.
-- Corrective actions among them are re-graded to NOTICE so the security view
-- does not start out claiming nothing has ever been voided.
UPDATE "AuditLog"
   SET "severity" = 'NOTICE'
 WHERE "action" LIKE '%.void'
    OR "action" LIKE '%.purge'
    OR "action" IN (
      'gift.adjust',
      'card.reissue',
      'roster.import',
      'import.run',
      'fallback.declare',
      'fallback.close',
      'settings.update',
      'user.provision',
      'user.update',
      'user.deactivate',
      'user.reactivate',
      'session.revoke'
    );

UPDATE "AuditLog"
   SET "severity" = 'WARNING'
 WHERE "action" = 'auth.stationScopeBypass';

UPDATE "AuditLog"
   SET "severity" = 'CRITICAL'
 WHERE "action" = 'session.reuseDetected';

CREATE INDEX "AuditLog_severity_createdAt_idx" ON "AuditLog"("severity", "createdAt");
CREATE INDEX "AuditLog_outcome_createdAt_idx" ON "AuditLog"("outcome", "createdAt");
CREATE INDEX "AuditLog_id_createdAt_idx" ON "AuditLog"("id", "createdAt");
