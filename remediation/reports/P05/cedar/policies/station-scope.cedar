// Station scope (ADR-005 §3, layer 2). Locked: admins cannot edit these.
//
// Guarantees: capture is recorded only where the person is on shift, and station-level reads
// and sends by an IC stay within the stations they are assigned to.

// Capture happens at a station you are on shift at right now. In REHEARSAL, being assigned to
// the station on any shift is enough, so a dry run needs no clock tricks (ADR-004 §2). Roles
// flagged anyStation (IC and above by default) may capture anywhere; the enforcement point
// audits that bypass, as today.
@id("station-scope.capture")
forbid (
  principal is SPOH::Membership,
  action in SPOH::Action::"Capture",
  resource is SPOH::Station
)
unless
{
  principal.role.anyStation ||
  principal.onShiftStations.contains(resource) ||
  (context.eventPhase == "REHEARSAL" && principal.assignedStations.contains(resource))
};

// An IC reads the roster (names, phone numbers) and sends station announcements only for the
// stations they are assigned to (F04-004, F04-024). Deputy and above (rank 30+) cover the
// whole event.
@id("station-scope.ic-own-stations")
forbid (
  principal is SPOH::Membership,
  action in [SPOH::Action::"Roster.ReadStation", SPOH::Action::"Announcement.SendStation"],
  resource is SPOH::Station
)
unless { principal.rank >= 30 || principal.assignedStations.contains(resource) };
