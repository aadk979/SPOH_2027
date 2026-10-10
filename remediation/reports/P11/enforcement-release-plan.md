# P11.5 enforcement — release plan for the owner (8 October 2026)

**Status: approved by the owner on 8 October 2026 (D-20).** Release 1 (shadow) is
[built and released](enforcement-shadow.md), and release 2a (D-21 and the screens) is
[on staging](enforcement-screens.md); D-21 answered release 2's four questions, and
release 2b (enforce) is [on staging](enforcement-release-2b.md) since 10 October (revision 156). Release 3 (delete) ships when built, with full CI and no soak or approval ([ADR-011](../../../docs/adr/ADR-011-build-first-verify-after.md), D-23). When this plan was written nothing was built. The role grants are stored and read (releases A `eddbc88` and B
`def8402`), and the authorizer exists, but `requireCapability` and
`requireStationScope` still decide every request.

## What changes for people

Enforcement switches about 140 route guards in 25 route files from the old
capability matrix to the Cedar policies. The approved changes in
[`CHANGES.md`](../../../packages/access-policies/CHANGES.md) (G1) take effect then:

| #   | Visible change                                                                                | Who notices                       |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------- |
| C1  | Only the assigned briefer completes a briefing slot                                           | anyone completing others' slots   |
| C2  | Only the audience acknowledges an announcement                                                | people outside the audience       |
| C3  | An IC reads rosters (with phone numbers) of their own stations only                           | ICs                               |
| C4  | An IC announces to their own stations only                                                    | ICs                               |
| C5  | Roles change through `People.AssignRole`; nobody grants their own rank or above               | Deputies, Chiefs, event Admins    |
| C6  | Lost-and-found close-out is Deputy, Chief and Admin                                           | Leads lose it                     |
| C7  | IC and Lead may list stations and days                                                        | ICs and Leads gain it             |
| C9  | Security and privacy settings (lost-person retention, visitor data) are platform admins' only | event Chiefs and Admins lose them |
| C13 | Archiving, reopening and role-permission editing are platform admins' only                    | already so in practice            |

C11 (capture only in REHEARSAL, LIVE, and CLOSED for late sync) is already
enforced by P10's capture admission; the policy repeats it. C8, C10 and C12 change
no one's access. C9 reverses D-17's interim answer for retention ("stays with event Chiefs and
Admins until P11"). The visitor-data part still waits on D-15.

## Proposed releases

1. **Shadow (no behaviour change).** Every guarded route also asks the local
   Cedar engine and logs a structured `authorization shadow mismatch` line when
   the answers differ. Each mismatch is tagged with the `CHANGES.md` row that
   explains it, or `unexplained`. The old guards still decide. Staging runs it
   for a smoke pass and a read-only walk as the smoke identity; the full server
   suite, run with shadow recording, walks every role. Acceptance: no response
   changes, no evaluation errors on staging, and every unexplained finding
   brought to the owner before release 2.
2. **Enforce.** `authorize(action, resolveResource)` replaces the old guards on
   every route in one reviewed step, as P11.5 specifies. Denials go to the security
   audit with the deciding policy ids. A test over the route inventory fails if a
   route has no `authorize`. The generated route × role matrix test replaces
   `rbac.test.ts`. The staging acceptance baseline is re-recorded, because C9
   changes the smoke identity's capabilities if it is not a platform admin.
3. **Delete.** Remove `requireCapability`, `requireStationScope` and the server's
   use of the capability matrix (the client's moves in P11.8).

Staging uses the local engine until P11.6 creates the AVP store. Production
waits for the 28 October go decision, as before.

## What I need from the owner

- Approve the three releases, or say "skip the shadow release" (faster, but the
  first evidence of an unexpected denial would then be a real denial on staging).
- Confirm that each organisation has at least one platform admin who can
  change lost-person retention once C9 applies.
