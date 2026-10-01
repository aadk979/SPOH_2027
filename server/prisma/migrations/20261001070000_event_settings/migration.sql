-- P09.14: the settings store of ADR-003 §2, started with the event's product
-- rules (ADR-002 §4). P10 moves every other setting into it.
CREATE TYPE "SettingScope" AS ENUM ('PLATFORM', 'EVENT', 'STATION');
CREATE TYPE "SettingChangeSource" AS ENUM ('USER', 'SCHEDULE', 'REVERT', 'RESET', 'CLONE', 'MIGRATION');

CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "scope" "SettingScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "eventId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedByPersonId" TEXT,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettingChange" (
    "id" TEXT NOT NULL,
    "scope" "SettingScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "eventId" TEXT,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "source" "SettingChangeSource" NOT NULL,
    "actorPersonId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SettingChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Setting_scope_scopeId_key_key" ON "Setting"("scope", "scopeId", "key");
CREATE INDEX "Setting_eventId_idx" ON "Setting"("eventId");
CREATE INDEX "SettingChange_scope_scopeId_key_version_idx" ON "SettingChange"("scope", "scopeId", "key", "version");
CREATE INDEX "SettingChange_eventId_idx" ON "SettingChange"("eventId");

ALTER TABLE "Setting" ADD CONSTRAINT "Setting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_updatedByPersonId_fkey" FOREIGN KEY ("updatedByPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SettingChange" ADD CONSTRAINT "SettingChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettingChange" ADD CONSTRAINT "SettingChange_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
