# P09.4 totals on staging, 2026-09-29

Release c5a7838 (Deploy staging run 36568340600) after the production-shape seed (56a0c3e, one-off seed task).
Run with: node infra/scripts/run-migrate-task.mjs - Spoh-staging-Platform totals

```text
ok   Event #1 exists: 1
ok   EventDay rows without an event: 0
ok   Station rows without an event: 0
ok   ShiftAssignment rows without an event: 0
ok   Attendance rows without an event: 0
ok   AttendanceChallenge rows without an event: 0
ok   AttendanceAttempt rows without an event: 0
ok   ShiftSwapRequest rows without an event: 0
ok   BriefingSlot rows without an event: 0
ok   Registration rows without an event: 0
ok   FootfallTick rows without an event: 0
ok   MissionCard rows without an event: 0
ok   CardStampEvent rows without an event: 0
ok   GiftType rows without an event: 0
ok   GiftRedemption rows without an event: 0
ok   GiftStockAdjustment rows without an event: 0
ok   Incident rows without an event: 0
ok   IncidentFollowUp rows without an event: 0
ok   LostPersonAlert rows without an event: 0
ok   LostPersonAck rows without an event: 0
ok   LostPersonSummary rows without an event: 0
ok   LostFoundItem rows without an event: 0
ok   Announcement rows without an event: 0
ok   AnnouncementAck rows without an event: 0
ok   FallbackWindow rows without an event: 0
ok   ImportBatch rows without an event: 0
ok   AuditLog rows without an event: 0
ok   IdempotencyRecord rows without an event: 0
ok   ShiftAssignment.membershipId is not volunteerId's membership: 0
ok   Attendance.membershipId is not volunteerId's membership: 0
ok   Attendance.verifiedByMembershipId is not verifiedById's membership: 0
ok   AttendanceChallenge.issuerMembershipId is not issuerId's membership: 0
ok   AttendanceAttempt.membershipId is not volunteerId's membership: 0
ok   ShiftSwapRequest.requesterMembershipId is not requesterId's membership: 0
ok   ShiftSwapRequest.targetMembershipId is not targetId's membership: 0
ok   ShiftSwapRequest.decidedByMembershipId is not decidedById's membership: 0
ok   BriefingSlot.briefierMembershipId is not briefierId's membership: 0
ok   Registration.recordedByMembershipId is not recordedById's membership: 0
ok   FootfallTick.recordedByMembershipId is not recordedById's membership: 0
ok   CardStampEvent.recordedByMembershipId is not recordedById's membership: 0
ok   GiftRedemption.recordedByMembershipId is not recordedById's membership: 0
ok   GiftStockAdjustment.createdByMembershipId is not createdById's membership: 0
ok   Incident.reportedByMembershipId is not reportedById's membership: 0
ok   IncidentFollowUp.authorMembershipId is not authorId's membership: 0
ok   LostPersonAlert.raisedByMembershipId is not raisedById's membership: 0
ok   LostPersonAck.membershipId is not volunteerId's membership: 0
ok   LostFoundItem.loggedByMembershipId is not loggedById's membership: 0
ok   Announcement.authorMembershipId is not authorId's membership: 0
ok   AnnouncementAck.membershipId is not volunteerId's membership: 0
ok   FallbackWindow.declaredByMembershipId is not declaredById's membership: 0
ok   ImportBatch.importedByMembershipId is not importedById's membership: 0
ok   AuditLog.membershipId is not actorId's membership: 0
ok   registrations per category: 0
ok   registrations in another event than their station: 0
ok   stations whose type grants something else: 0
ok   stations whose course tag differs: 0
ok   assignments off their day and block: 0
ok   volunteers without a matching membership: 0
```
