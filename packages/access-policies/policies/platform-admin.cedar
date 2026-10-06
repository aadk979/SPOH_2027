// Platform administration (ADR-005 §3). Locked.
//
// Guarantees: platform admins (OrganisationMembership role PLATFORM_ADMIN) create and clone
// events, manage the organisation, and alone perform the locked actions: editing role
// permissions, security and privacy settings, reopening and archiving. Inside an event they are
// not a member of, they can administer (read) it, and nothing else; to operate it they add
// themselves a membership, which is audited.

@id("platform.admin")
permit (principal is SPOH::Person, action in SPOH::Action::"Platform", resource)
when { principal.platformAdmin };

@id("platform.locked-actions")
permit (
  principal is SPOH::Person,
  action in
    [SPOH::Action::"Permissions.Edit",
     SPOH::Action::"Settings.ManageSecurity",
     SPOH::Action::"Settings.ManagePrivacy",
     SPOH::Action::"Event.Reopen",
     SPOH::Action::"Event.Archive"],
  resource
)
when { principal.platformAdmin };

@id("platform.locked-actions-as-member")
permit (
  principal is SPOH::Membership,
  action in
    [SPOH::Action::"Permissions.Edit",
     SPOH::Action::"Settings.ManageSecurity",
     SPOH::Action::"Settings.ManagePrivacy",
     SPOH::Action::"Event.Reopen",
     SPOH::Action::"Event.Archive"],
  resource
)
when { principal.person.platformAdmin };

// Only a platform admin can make someone an event Admin: every member is limited to granting
// roles below their own rank (guardrail.grant-below-own-rank).
@id("platform.assign-any-role")
permit (
  principal is SPOH::Person,
  action in [SPOH::Action::"People.Invite", SPOH::Action::"People.AssignRole"],
  resource
)
when { principal.platformAdmin };
