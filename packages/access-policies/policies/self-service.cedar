// Self-service (ADR-005 §3). Locked. Replaces the `own.read` capability, which gated writes
// (F02 § P02.9) with ownership checks buried in services.
//
// Guarantees: every active member can read their own record and act on their own shifts,
// briefings and inbox, and only on those.

@id("self.read")
permit (
  principal is SPOH::Membership,
  action == SPOH::Action::"Self.Read",
  resource is SPOH::Membership
)
when { resource == principal };

// Your own shift only (me/service.ts loadOwnAssignment, shift/service.ts:65).
@id("self.own-shift")
permit (
  principal is SPOH::Membership,
  action in [SPOH::Action::"Shift.CheckIn", SPOH::Action::"Swap.Request"],
  resource is SPOH::ShiftAssignment
)
when { resource.membership == principal };

// Check-in needs today's verified attendance and a running shift (me/service.ts:101). In
// REHEARSAL the shift does not have to be running.
@id("self.check-in-conditions")
forbid (
  principal is SPOH::Membership,
  action == SPOH::Action::"Shift.CheckIn",
  resource is SPOH::ShiftAssignment
)
unless
{
  principal.attendanceVerifiedToday &&
  (resource.shiftRunning || context.eventPhase == "REHEARSAL")
};

// Only the assigned briefer completes a briefing slot (F03-016: the rule was inverted).
@id("self.briefing")
permit (
  principal is SPOH::Membership,
  action == SPOH::Action::"Briefing.Complete",
  resource is SPOH::BriefingSlot
)
when { resource has briefer && resource.briefer == principal };

// Acknowledge only an announcement addressed to you: role, station and day all match when set
// (F04-005). The same rule as the inbox query (announcement/repo.ts listForRecipient).
@id("self.announcement-ack")
permit (
  principal is SPOH::Membership,
  action == SPOH::Action::"Announcement.Ack",
  resource is SPOH::Announcement
)
when
{
  (if resource has targetRole
   then resource.targetRole == principal.role.catalogueRole
   else true) &&
  (if resource has targetStation
   then principal.assignedStations.contains(resource.targetStation)
   else true) &&
  (if resource has targetDay
   then principal.workingDays.contains(resource.targetDay)
   else true)
};

// Lost-person alerts go to the whole event, so everyone may acknowledge them.
@id("self.alert-ack")
permit (
  principal is SPOH::Membership,
  action == SPOH::Action::"Alert.Ack",
  resource is SPOH::LostPersonAlert
);

@id("self.attendance-submit")
permit (
  principal is SPOH::Membership,
  action == SPOH::Action::"Attendance.Submit",
  resource is SPOH::EventDay
);
