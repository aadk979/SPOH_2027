// Locked guardrails (ADR-005 §3, layer 3). `forbid` beats every `permit`, and no admin screen
// can edit or remove these: they change only through a reviewed commit and a CDK deploy.
//
// Guarantees: nobody acts on themselves or on someone of equal or higher rank; nobody grants a
// role at or above their own; nothing crosses from one event into another; capture happens only
// while the event is capturing; an archived event is read-only; the event's structure is frozen
// once it is live; locked actions belong to platform admins.

// A deactivated membership, or a person switched off platform-wide, can do nothing.
@id("guardrail.inactive-member")
forbid (principal is SPOH::Membership, action, resource)
unless { principal.active && principal.person.active };

@id("guardrail.inactive-person")
forbid (principal is SPOH::Person, action, resource)
unless { principal.active };

// Defence in depth for ADR-001: a membership only ever acts on its own event's resources.
@id("guardrail.same-event")
forbid (principal is SPOH::Membership, action, resource)
unless { resource in principal.event };

// No acting on yourself: editing, deactivating or re-roling your own membership.
@id("guardrail.not-on-yourself")
forbid (
  principal is SPOH::Membership,
  action in
    [SPOH::Action::"People.Update",
     SPOH::Action::"People.Deactivate",
     SPOH::Action::"People.AssignRole"],
  resource is SPOH::Membership
)
when { resource == principal };

// Only people below you: never a peer or a superior (was admin/service.ts assertCanActOn, which
// the roster import skipped: F03-001).
@id("guardrail.outrank-target")
forbid (
  principal is SPOH::Membership,
  action in
    [SPOH::Action::"People.Update",
     SPOH::Action::"People.Deactivate",
     SPOH::Action::"People.AssignRole"],
  resource is SPOH::Membership
)
when { resource.rank >= principal.rank };

// Never grant a role at or above your own. The enforcement point must send grantedRank; if it
// does not, the request is refused rather than allowed.
@id("guardrail.grant-below-own-rank")
forbid (
  principal is SPOH::Membership,
  action in [SPOH::Action::"People.AssignRole", SPOH::Action::"People.Invite"],
  resource
)
unless { context has grantedRank && context.grantedRank < principal.rank };

// Capture only while the event is capturing: REHEARSAL, LIVE, or a queued capture that was
// recorded before the close and syncs inside the grace period (ADR-004 §1).
@id("guardrail.capture-window")
forbid (principal, action in SPOH::Action::"Capture", resource)
unless
{
  context.eventPhase == "LIVE" ||
  context.eventPhase == "REHEARSAL" ||
  (context.eventPhase == "CLOSED" && context.lateSyncAllowed)
};

// An archived event is read-only for everyone, platform admins included.
@id("guardrail.archived-read-only")
forbid (principal, action in SPOH::Action::"Write", resource)
when { context.eventPhase == "ARCHIVED" };

// Once live, the event's structure (days, shift templates, station types, categories) can be
// relabelled or deactivated (Structure.Edit) but not created, deleted or re-capabilitied.
@id("guardrail.structure-frozen-when-live")
forbid (
  principal is SPOH::Membership,
  action == SPOH::Action::"Structure.Change",
  resource
)
when { ["LIVE", "CLOSED", "ARCHIVED"].contains(context.eventPhase) };

// Locked actions are never granted through a role, whatever a future policy says.
@id("guardrail.locked-actions")
forbid (
  principal is SPOH::Membership,
  action in
    [SPOH::Action::"Permissions.Edit",
     SPOH::Action::"Settings.ManageSecurity",
     SPOH::Action::"Settings.ManagePrivacy",
     SPOH::Action::"Event.Reopen",
     SPOH::Action::"Event.Archive"],
  resource
)
unless { principal.person.platformAdmin };
