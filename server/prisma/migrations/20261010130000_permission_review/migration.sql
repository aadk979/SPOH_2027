ALTER TABLE "Event"
  ADD COLUMN "permissionsVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "permissionsReviewedVersion" INTEGER,
  ADD COLUMN "permissionsReviewedAt" TIMESTAMPTZ(3);

-- Every writer, including older APIs and clone/default grants, invalidates review evidence.
CREATE FUNCTION bump_permission_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE "Event" SET "permissionsVersion" = "permissionsVersion" + 1
      WHERE id = OLD."eventId";
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW."eventId" <> OLD."eventId") THEN
    UPDATE "Event" SET "permissionsVersion" = "permissionsVersion" + 1
      WHERE id = NEW."eventId";
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER role_permission_review_version
  AFTER INSERT OR UPDATE OR DELETE ON "RolePermission"
  FOR EACH ROW EXECUTE FUNCTION bump_permission_version();
