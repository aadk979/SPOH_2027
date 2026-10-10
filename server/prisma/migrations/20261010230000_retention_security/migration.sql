ALTER TABLE "Person" ADD COLUMN "piiErasedAt" TIMESTAMPTZ(3);
CREATE TABLE "IdentityDeliveryQuota" (
  "id" TEXT PRIMARY KEY,
  "used" INTEGER NOT NULL DEFAULT 0 CHECK ("used" >= 0),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "IdentityDeliveryQuota_expiresAt_idx" ON "IdentityDeliveryQuota" ("expiresAt");

-- The app has INSERT/SELECT, never direct UPDATE/DELETE on audit history. This
-- owner-executed function exposes only the immutable ADR003 400-day deadline.
CREATE FUNCTION public.prune_expired_audit() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM public."AuditLog" a
  WHERE (a."eventId" IS NULL AND a."createdAt" < CURRENT_TIMESTAMP - INTERVAL '400 days')
     OR EXISTS (SELECT 1 FROM public."Event" e WHERE e.id = a."eventId"
       AND e.status = 'ARCHIVED' AND e."archivedAt" < CURRENT_TIMESTAMP - INTERVAL '400 days');
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_expired_audit() FROM PUBLIC;
