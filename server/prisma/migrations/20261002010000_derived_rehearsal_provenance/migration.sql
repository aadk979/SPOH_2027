-- Preserve the parent's mode, including practice rows written before this migration.
BEGIN;
ALTER TABLE "IncidentFollowUp" ADD COLUMN "rehearsal" BOOLEAN;
UPDATE "IncidentFollowUp" child SET "rehearsal" = parent."rehearsal"
  FROM "Incident" parent WHERE child."eventId" = parent."eventId" AND child."incidentId" = parent.id;
ALTER TABLE "IncidentFollowUp" ALTER COLUMN "rehearsal" SET NOT NULL;
ALTER TABLE "LostPersonAck" ADD COLUMN "rehearsal" BOOLEAN;
UPDATE "LostPersonAck" child SET "rehearsal" = parent."rehearsal"
  FROM "LostPersonAlert" parent WHERE child."eventId" = parent."eventId" AND child."alertId" = parent.id;
ALTER TABLE "LostPersonAck" ALTER COLUMN "rehearsal" SET NOT NULL;
ALTER TABLE "VisitorRecord" ADD COLUMN "rehearsal" BOOLEAN;
UPDATE "VisitorRecord" child SET "rehearsal" = parent."rehearsal"
  FROM "Registration" parent WHERE child."eventId" = parent."eventId" AND child."registrationId" = parent.id;
ALTER TABLE "VisitorRecord" ALTER COLUMN "rehearsal" SET NOT NULL;

CREATE UNIQUE INDEX "Incident_eventId_id_rehearsal_key" ON "Incident"("eventId", "id", "rehearsal");
CREATE UNIQUE INDEX "LostPersonAlert_eventId_id_rehearsal_key" ON "LostPersonAlert"("eventId", "id", "rehearsal");
CREATE UNIQUE INDEX "Registration_eventId_id_rehearsal_key" ON "Registration"("eventId", "id", "rehearsal");
CREATE UNIQUE INDEX "VisitorRecord_eventId_registrationId_rehearsal_key" ON "VisitorRecord"("eventId", "registrationId", "rehearsal");
ALTER TABLE "IncidentFollowUp" DROP CONSTRAINT "IncidentFollowUp_eventId_incidentId_fkey";
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_eventId_incidentId_rehearsal_fkey"
  FOREIGN KEY ("eventId", "incidentId", "rehearsal") REFERENCES "Incident"("eventId", "id", "rehearsal") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "LostPersonAck" DROP CONSTRAINT "LostPersonAck_eventId_alertId_fkey";
ALTER TABLE "LostPersonAck" ADD CONSTRAINT "LostPersonAck_eventId_alertId_rehearsal_fkey"
  FOREIGN KEY ("eventId", "alertId", "rehearsal") REFERENCES "LostPersonAlert"("eventId", "id", "rehearsal") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "VisitorRecord" DROP CONSTRAINT "VisitorRecord_eventId_registrationId_fkey";
ALTER TABLE "VisitorRecord" ADD CONSTRAINT "VisitorRecord_eventId_registrationId_rehearsal_fkey"
  FOREIGN KEY ("eventId", "registrationId", "rehearsal") REFERENCES "Registration"("eventId", "id", "rehearsal") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "IncidentFollowUp_eventId_rehearsal_idx" ON "IncidentFollowUp"("eventId", "rehearsal");
CREATE INDEX "LostPersonAck_eventId_rehearsal_idx" ON "LostPersonAck"("eventId", "rehearsal");
CREATE INDEX "VisitorRecord_eventId_rehearsal_idx" ON "VisitorRecord"("eventId", "rehearsal");

-- Rolling deployments can still have writers which do not name the new column.
-- Only an omitted/null insert derives a value; an explicit wrong mode fails its FK.
-- There is deliberately no false default, which would misclassify practice children.
CREATE FUNCTION public.derive_follow_up_rehearsal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT parent.rehearsal INTO NEW.rehearsal FROM public."Incident" parent
    WHERE parent."eventId" = NEW."eventId" AND parent.id = NEW."incidentId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "IncidentFollowUp_derive_rehearsal" BEFORE INSERT ON "IncidentFollowUp"
  FOR EACH ROW WHEN (NEW.rehearsal IS NULL) EXECUTE FUNCTION public.derive_follow_up_rehearsal();
CREATE FUNCTION public.derive_lost_person_ack_rehearsal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT parent.rehearsal INTO NEW.rehearsal FROM public."LostPersonAlert" parent
    WHERE parent."eventId" = NEW."eventId" AND parent.id = NEW."alertId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "LostPersonAck_derive_rehearsal" BEFORE INSERT ON "LostPersonAck"
  FOR EACH ROW WHEN (NEW.rehearsal IS NULL) EXECUTE FUNCTION public.derive_lost_person_ack_rehearsal();
CREATE FUNCTION public.derive_visitor_record_rehearsal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT parent.rehearsal INTO NEW.rehearsal FROM public."Registration" parent
    WHERE parent."eventId" = NEW."eventId" AND parent.id = NEW."registrationId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "VisitorRecord_derive_rehearsal" BEFORE INSERT ON "VisitorRecord"
  FOR EACH ROW WHEN (NEW.rehearsal IS NULL) EXECUTE FUNCTION public.derive_visitor_record_rehearsal();
COMMIT;
