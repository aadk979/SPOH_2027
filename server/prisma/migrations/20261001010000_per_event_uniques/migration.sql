-- P09.9: station codes, gift type names and event days are unique within an
-- event, not across every event, so a cloned event keeps its structure's names
-- and a second event may run on the same date (ADR-001 §6). Every row carries
-- its eventId since P09.4.

-- Station: code within the event.
DROP INDEX "Station_code_key";
DROP INDEX "Station_eventId_code_idx";
CREATE UNIQUE INDEX "Station_eventId_code_key" ON "Station"("eventId", "code");

-- GiftType: name within the event.
DROP INDEX "GiftType_name_key";
CREATE UNIQUE INDEX "GiftType_eventId_name_key" ON "GiftType"("eventId", "name");

-- EventDay: one day per date within the event.
DROP INDEX "EventDay_date_key";
CREATE UNIQUE INDEX "EventDay_eventId_date_key" ON "EventDay"("eventId", "date");
