-- Runtime may update event lifecycle metadata, but cannot shorten an audit row's
-- own fixed retention by backdating an archive. The immutable row timestamp is
-- always the minimum deadline, including rows recorded after an event closed.
CREATE OR REPLACE FUNCTION public.prune_expired_audit() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM public."AuditLog" a
  WHERE a."createdAt" < CURRENT_TIMESTAMP - INTERVAL '400 days'
    AND (a."eventId" IS NULL
      OR EXISTS (SELECT 1 FROM public."Event" e WHERE e.id = a."eventId"
        AND e.status = 'ARCHIVED'
        AND e."archivedAt" < CURRENT_TIMESTAMP - INTERVAL '400 days'));
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_expired_audit() FROM PUBLIC;
