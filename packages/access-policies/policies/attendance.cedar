// Attendance gate (ADR-005 §3). Locked.
//
// Guarantees: only someone verified present today (or the event's attendance root) can verify
// others, and only the root can mark someone present without a code. The root is a membership
// flag set from the event settings (ADR-003: attendance.rootMembershipId), no longer an env
// email (F02-017).

@id("attendance.issue-code")
permit (
  principal is SPOH::Membership,
  action == SPOH::Action::"Attendance.IssueCode",
  resource is SPOH::EventDay
)
when { principal.attendanceVerifiedToday || principal.isAttendanceRoot };

@id("attendance.root")
permit (
  principal is SPOH::Membership,
  action == SPOH::Action::"Attendance.MarkRoot",
  resource is SPOH::Membership
)
when { principal.isAttendanceRoot };
