-- Grants for the app role (P08.3, F04-015). Run as spoh_migrator AFTER every
-- `prisma migrate deploy`, so tables a migration added are covered. Idempotent.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO spoh_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spoh_app;
ALTER DEFAULT PRIVILEGES FOR ROLE spoh_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO spoh_app;
ALTER DEFAULT PRIVILEGES FOR ROLE spoh_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO spoh_app;

-- The audit trail is append-only for the app: no update, no delete, no truncate.
-- Retention is changed by a migration, which runs as spoh_migrator.
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM spoh_app;
GRANT EXECUTE ON FUNCTION public.prune_expired_audit() TO spoh_app;
-- Prisma's own bookkeeping is the migrator's business alone.
REVOKE ALL ON "_prisma_migrations" FROM spoh_app;
