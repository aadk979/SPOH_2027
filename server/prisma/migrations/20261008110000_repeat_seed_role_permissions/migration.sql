-- P11.5 prerequisite (role grants, release B): the seed again, for any event the
-- previous code created while release A rolled out. Release A was the only running
-- task before this migration, and since then every new event and clone writes its
-- grants itself. The body is byte-identical to 20261008090100_seed_role_permissions
-- (the migration harness checks it): an event with grants is left alone, and it
-- fails, writing nothing, unless every event it seeds ends with the default set.
DO $$
DECLARE
  expected CONSTANT integer := 156;
  bare text[];
  seeded integer;
  short text;
BEGIN
  SELECT coalesce(array_agg(e."id" ORDER BY e."id"), '{}') INTO bare
  FROM "Event" e
  WHERE NOT EXISTS (SELECT 1 FROM "RolePermission" r WHERE r."eventId" = e."id");
  IF cardinality(bare) = 0 THEN
    RAISE NOTICE 'role grants seed: every event already has grants';
    RETURN;
  END IF;

  WITH defaults (role, action) AS (
    VALUES
      ('VOLUNTEER', 'Card.Stamp'),
      ('VOLUNTEER', 'Footfall.Create'),
      ('VOLUNTEER', 'Gift.Redeem'),
      ('VOLUNTEER', 'Incident.Report'),
      ('VOLUNTEER', 'LostFound.Claim'),
      ('VOLUNTEER', 'LostFound.Log'),
      ('VOLUNTEER', 'LostPerson.Raise'),
      ('VOLUNTEER', 'Registration.Create'),
      ('IC', 'Announcement.SendStation'),
      ('IC', 'Card.Reissue'),
      ('IC', 'Card.Stamp'),
      ('IC', 'Card.Void'),
      ('IC', 'Count.Adjust'),
      ('IC', 'Dashboard.ReadStation'),
      ('IC', 'Footfall.Create'),
      ('IC', 'Gift.Redeem'),
      ('IC', 'Incident.Read'),
      ('IC', 'Incident.Report'),
      ('IC', 'Incident.Update'),
      ('IC', 'LostFound.Claim'),
      ('IC', 'LostFound.Log'),
      ('IC', 'LostPerson.Raise'),
      ('IC', 'LostPerson.Resolve'),
      ('IC', 'Record.Void'),
      ('IC', 'Registration.Create'),
      ('IC', 'Roster.ReadStation'),
      ('IC', 'Structure.Read'),
      ('IC', 'Swap.Decide'),
      ('DEPUTY_COORDINATOR', 'Announcement.SendEvent'),
      ('DEPUTY_COORDINATOR', 'Announcement.SendStation'),
      ('DEPUTY_COORDINATOR', 'Card.Reissue'),
      ('DEPUTY_COORDINATOR', 'Card.Stamp'),
      ('DEPUTY_COORDINATOR', 'Card.Void'),
      ('DEPUTY_COORDINATOR', 'Count.Adjust'),
      ('DEPUTY_COORDINATOR', 'Dashboard.ReadEvent'),
      ('DEPUTY_COORDINATOR', 'Dashboard.ReadStation'),
      ('DEPUTY_COORDINATOR', 'Fallback.Declare'),
      ('DEPUTY_COORDINATOR', 'Footfall.Create'),
      ('DEPUTY_COORDINATOR', 'Gift.Redeem'),
      ('DEPUTY_COORDINATOR', 'Incident.Read'),
      ('DEPUTY_COORDINATOR', 'Incident.Report'),
      ('DEPUTY_COORDINATOR', 'Incident.Update'),
      ('DEPUTY_COORDINATOR', 'LostFound.Claim'),
      ('DEPUTY_COORDINATOR', 'LostFound.CloseOut'),
      ('DEPUTY_COORDINATOR', 'LostFound.Log'),
      ('DEPUTY_COORDINATOR', 'LostPerson.Raise'),
      ('DEPUTY_COORDINATOR', 'LostPerson.Resolve'),
      ('DEPUTY_COORDINATOR', 'People.Read'),
      ('DEPUTY_COORDINATOR', 'Record.Void'),
      ('DEPUTY_COORDINATOR', 'Registration.Create'),
      ('DEPUTY_COORDINATOR', 'Report.Export'),
      ('DEPUTY_COORDINATOR', 'Report.Generate'),
      ('DEPUTY_COORDINATOR', 'Roster.Edit'),
      ('DEPUTY_COORDINATOR', 'Roster.ReadStation'),
      ('DEPUTY_COORDINATOR', 'Structure.Read'),
      ('DEPUTY_COORDINATOR', 'Swap.Decide'),
      ('CHIEF_COORDINATOR', 'Announcement.SendEvent'),
      ('CHIEF_COORDINATOR', 'Announcement.SendStation'),
      ('CHIEF_COORDINATOR', 'Audit.Read'),
      ('CHIEF_COORDINATOR', 'Card.GenerateBatch'),
      ('CHIEF_COORDINATOR', 'Card.Reissue'),
      ('CHIEF_COORDINATOR', 'Card.Stamp'),
      ('CHIEF_COORDINATOR', 'Card.Void'),
      ('CHIEF_COORDINATOR', 'Content.Edit'),
      ('CHIEF_COORDINATOR', 'Content.Publish'),
      ('CHIEF_COORDINATOR', 'Count.Adjust'),
      ('CHIEF_COORDINATOR', 'Dashboard.ReadEvent'),
      ('CHIEF_COORDINATOR', 'Dashboard.ReadStation'),
      ('CHIEF_COORDINATOR', 'Event.Close'),
      ('CHIEF_COORDINATOR', 'Event.GoLive'),
      ('CHIEF_COORDINATOR', 'Event.MarkReady'),
      ('CHIEF_COORDINATOR', 'Event.Rehearse'),
      ('CHIEF_COORDINATOR', 'Fallback.Declare'),
      ('CHIEF_COORDINATOR', 'Fallback.Import'),
      ('CHIEF_COORDINATOR', 'Footfall.Create'),
      ('CHIEF_COORDINATOR', 'Gift.Redeem'),
      ('CHIEF_COORDINATOR', 'Incident.Read'),
      ('CHIEF_COORDINATOR', 'Incident.Report'),
      ('CHIEF_COORDINATOR', 'Incident.Update'),
      ('CHIEF_COORDINATOR', 'LostFound.Claim'),
      ('CHIEF_COORDINATOR', 'LostFound.CloseOut'),
      ('CHIEF_COORDINATOR', 'LostFound.Log'),
      ('CHIEF_COORDINATOR', 'LostPerson.Raise'),
      ('CHIEF_COORDINATOR', 'LostPerson.Resolve'),
      ('CHIEF_COORDINATOR', 'People.AssignRole'),
      ('CHIEF_COORDINATOR', 'People.Deactivate'),
      ('CHIEF_COORDINATOR', 'People.Invite'),
      ('CHIEF_COORDINATOR', 'People.Read'),
      ('CHIEF_COORDINATOR', 'People.Update'),
      ('CHIEF_COORDINATOR', 'Record.Void'),
      ('CHIEF_COORDINATOR', 'Registration.Create'),
      ('CHIEF_COORDINATOR', 'Report.Export'),
      ('CHIEF_COORDINATOR', 'Report.Generate'),
      ('CHIEF_COORDINATOR', 'Roster.Edit'),
      ('CHIEF_COORDINATOR', 'Roster.ReadStation'),
      ('CHIEF_COORDINATOR', 'Schedule.Manage'),
      ('CHIEF_COORDINATOR', 'Settings.ManageEvent'),
      ('CHIEF_COORDINATOR', 'Structure.Change'),
      ('CHIEF_COORDINATOR', 'Structure.Edit'),
      ('CHIEF_COORDINATOR', 'Structure.Read'),
      ('CHIEF_COORDINATOR', 'Swap.Decide'),
      ('LEAD', 'Audit.Read'),
      ('LEAD', 'Dashboard.ReadEvent'),
      ('LEAD', 'Dashboard.ReadStation'),
      ('LEAD', 'Incident.Report'),
      ('LEAD', 'LostPerson.Raise'),
      ('LEAD', 'People.Read'),
      ('LEAD', 'Report.Export'),
      ('LEAD', 'Report.Generate'),
      ('LEAD', 'Roster.ReadStation'),
      ('LEAD', 'Structure.Read'),
      ('ADMIN', 'Announcement.SendEvent'),
      ('ADMIN', 'Announcement.SendStation'),
      ('ADMIN', 'Audit.Read'),
      ('ADMIN', 'Card.GenerateBatch'),
      ('ADMIN', 'Card.Reissue'),
      ('ADMIN', 'Card.Stamp'),
      ('ADMIN', 'Card.Void'),
      ('ADMIN', 'Content.Edit'),
      ('ADMIN', 'Content.Publish'),
      ('ADMIN', 'Count.Adjust'),
      ('ADMIN', 'Dashboard.ReadEvent'),
      ('ADMIN', 'Dashboard.ReadStation'),
      ('ADMIN', 'Event.Close'),
      ('ADMIN', 'Event.GoLive'),
      ('ADMIN', 'Event.MarkReady'),
      ('ADMIN', 'Event.Rehearse'),
      ('ADMIN', 'Fallback.Declare'),
      ('ADMIN', 'Fallback.Import'),
      ('ADMIN', 'Footfall.Create'),
      ('ADMIN', 'Gift.Redeem'),
      ('ADMIN', 'Incident.Read'),
      ('ADMIN', 'Incident.Report'),
      ('ADMIN', 'Incident.Update'),
      ('ADMIN', 'LostFound.Claim'),
      ('ADMIN', 'LostFound.CloseOut'),
      ('ADMIN', 'LostFound.Log'),
      ('ADMIN', 'LostPerson.Raise'),
      ('ADMIN', 'LostPerson.Resolve'),
      ('ADMIN', 'People.AssignRole'),
      ('ADMIN', 'People.Deactivate'),
      ('ADMIN', 'People.Invite'),
      ('ADMIN', 'People.Read'),
      ('ADMIN', 'People.Update'),
      ('ADMIN', 'Record.Void'),
      ('ADMIN', 'Registration.Create'),
      ('ADMIN', 'Report.Export'),
      ('ADMIN', 'Report.Generate'),
      ('ADMIN', 'Roster.Edit'),
      ('ADMIN', 'Roster.ReadStation'),
      ('ADMIN', 'Schedule.Manage'),
      ('ADMIN', 'Settings.ManageEvent'),
      ('ADMIN', 'Structure.Change'),
      ('ADMIN', 'Structure.Edit'),
      ('ADMIN', 'Structure.Read'),
      ('ADMIN', 'Swap.Decide')
  )
  INSERT INTO "RolePermission" ("id", "eventId", "role", "action", "createdAt")
  SELECT gen_random_uuid()::text, b.id, d.role::"CommitteeRole", d.action, now()
  FROM unnest(bare) AS b(id) CROSS JOIN defaults d;
  GET DIAGNOSTICS seeded = ROW_COUNT;

  SELECT string_agg(b.id, ', ' ORDER BY b.id) INTO short
  FROM unnest(bare) AS b(id)
  WHERE (SELECT count(*) FROM "RolePermission" r WHERE r."eventId" = b.id) <> expected;
  IF short IS NOT NULL OR seeded <> expected * cardinality(bare) THEN
    RAISE EXCEPTION 'role grants seed: wrote % row(s); event(s) without exactly % grants: %',
      seeded, expected, coalesce(short, 'none');
  END IF;
  RAISE NOTICE 'role grants seed: % row(s) for % event(s)', seeded, cardinality(bare);
END $$;
