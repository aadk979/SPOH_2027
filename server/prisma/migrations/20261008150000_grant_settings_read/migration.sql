-- D-21: Settings.Read, reading the event's configuration (settings, categories, schedules,
-- lifecycle), is granted to Chiefs and Admins by default. Every event that has grants
-- gains it for both roles, and nothing else changes; an event without grants stays without
-- (its rows come from the role grants seed). New events and clones take it from
-- default-grants.json. Re-runnable: a grant that exists is left alone.
INSERT INTO "RolePermission" ("id", "eventId", "role", "action", "createdAt")
SELECT gen_random_uuid()::text, e."eventId", r.role::"CommitteeRole", 'Settings.Read', now()
FROM (SELECT DISTINCT "eventId" FROM "RolePermission") AS e
CROSS JOIN (VALUES ('CHIEF_COORDINATOR'), ('ADMIN')) AS r(role)
ON CONFLICT ("eventId", "role", "action") DO NOTHING;
