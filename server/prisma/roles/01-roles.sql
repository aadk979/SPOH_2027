-- Database roles (P08.3, F04-015). Run by the RDS admin user BEFORE migrations,
-- once per database and safe to repeat. Passwords are set by db-roles.mjs from
-- Secrets Manager, never written here.
--
--   spoh_migrator  owns the schema; `prisma migrate deploy` runs as it.
--   spoh_app       what the API connects as: reads and writes data, but may only
--                  insert and read AuditLog (02-grants.sql), so no bug or
--                  compromised task can rewrite the audit trail.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'spoh_migrator') THEN
    CREATE ROLE spoh_migrator LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'spoh_app') THEN
    CREATE ROLE spoh_app LOGIN;
  END IF;
END
$$;

-- RDS's admin is not a true superuser: it hands the schema over through membership.
GRANT spoh_migrator TO CURRENT_USER;
-- The migrator owns the schema, so every table a migration creates is its own.
ALTER SCHEMA public OWNER TO spoh_migrator;
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO spoh_migrator, spoh_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO spoh_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
