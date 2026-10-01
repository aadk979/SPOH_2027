BEGIN;
ALTER TABLE "Event" ADD COLUMN "hasBeenLive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "Event" SET "hasBeenLive" = true WHERE status IN ('LIVE', 'CLOSED', 'ARCHIVED');

-- Older API writers can still change phase during a rolling deployment.
-- Preserve observed live history and increment the version on every real phase change.
CREATE FUNCTION public.track_event_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW."hasBeenLive" := OLD."hasBeenLive" OR NEW."hasBeenLive" OR NEW.status IN ('LIVE', 'CLOSED', 'ARCHIVED');
    NEW."lifecycleVersion" := OLD."lifecycleVersion" + CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN 1 ELSE 0 END;
  ELSE
    NEW."hasBeenLive" := NEW."hasBeenLive" OR NEW.status IN ('LIVE', 'CLOSED', 'ARCHIVED');
    NEW."lifecycleVersion" := 0;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Event_track_lifecycle" BEFORE INSERT OR UPDATE ON "Event"
  FOR EACH ROW EXECUTE FUNCTION public.track_event_lifecycle();
COMMIT;
