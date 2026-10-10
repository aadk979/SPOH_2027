# P12 identity build — 10 October 2026

**Status: local batch CI passed; exact-commit GitHub CI pending.** No AWS resources were created,
no messages were sent to real people, and no production identity configuration was changed.
Affected suites and the full local gate passed against `spoh2027_test`, with unchanged coverage
floors. The main push and GitHub CI are still required. This report does not close a tracker step.
See the [batch verification record](../BATCH-2026-10-10-NIGHT.md).

## Built in this batch

| Area          | Behaviour and source evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pool target   | `infra/cdk/src/stagingIdentity.ts` and `test/identityHardening.test.ts`: synthetic staging pool, no signup, twelve-character password policy, thirty-day temporary passwords, optional TOTP, code flow, revocation, five-minute ID/access tokens and sixty-minute provider refresh tokens. App MFA requirements remain separate from the pool's optional setting.                                                                                                                                                                                             |
| Memberships   | `server/src/modules/people`, `modules/roster` and `platform/identity/membershipAcceptance.ts`: case-insensitive identity reuse, invite/resend/first-use acceptance, guarded role changes, event/global deactivate/reactivate, session/push invalidation and audited archive membership ending. Event deactivation does not silently disable a person's access to other events.                                                                                                                                                                                |
| Provisioning  | `client/src/features/provisioning`, `features/volunteers` and `features/people`: single invite, CSV preview/apply, bulk resend/deactivate/role changes, invite/last-seen status, platform person membership detail and global lifecycle controls. Browser specifications use synthetic UI fixtures; they do not prove Cognito email delivery.                                                                                                                                                                                                                 |
| Sessions      | `modules/auth`, `platform/identity/sessionSecurity.ts`, `client/src/features/session` and `shared/lib/sessionHandoff.ts`: restricted MFA enrolment, admin idle/absolute limits, conditional refresh rotation with a concurrent-request grace, device list/revoke and administrative sign-out. Production recovery uses a first-party, one-use code handoff; bearer credentials stay in memory. Active-tab renewal is explicit so a timer cannot discard unsaved forms. Expired-access logout and multi-event device regressions are part of the current gate. |
| Groups        | `platform/identity/cognitoIdentityProvider.ts` authenticates/provisions without role groups. `server/scripts/cognito-groups.mjs` supplies a dry-run cleanup path. Memberships, organisation membership and Cedar remain authoritative. No cleanup was run against AWS.                                                                                                                                                                                                                                                                                        |
| Live verifier | `server/scripts/verify-cognito.mjs` uses read-only pool/client Describe APIs to check the implemented configuration. An explicitly supplied short-lived synthetic provider token enables the provider-to-thin-session exchange, provider bearer rejection, cookie/device checks and logout. Two verifier unit checks and lint passed; no AWS requests were made. The verifier does not create users, use role groups or request the password grant.                                                                                                           |

## P12.2 is reduced by D-08

The owner's 30 September D-08 amendment supersedes the phase's original SES design: **Cognito's
default sender, no SES, no Route 53 and no paid mail service.** This is an explicit scope reduction,
not an unbuilt SES feature deferred to P16. There is no app-sent event-membership email through SES.

The pool carries an invitation template and a thirty-day temporary-password validity. The shared
`identity.inviteDailyLimit` defaults to fifty deliveries; `platform/identity/deliveryQuota.ts`
serialises reservations across instances/events for the configured pool. Over-limit work receives
an actionable 429 instead of silently creating the whole batch. Provider delivery is still an
external side effect, and this application allowance is not proof of the provider's current quota
or receipt. Staging delivery, resend and allowance behaviour are P16.8 acceptance items.

## Remaining build work and approval boundaries

- **P12.1 stays partial:** managed-login branding and the future production pool configuration
  path are not complete. The pool previously referenced by production was deleted in the
  owner-directed teardown. A dangling reference is not a managed or restored pool. January Plus
  remains the approved event-month option; this report does not enable it or create production.
- **P12.4 acceptance specification is written:** the provisioning browser spec covers fifty
  distinct people, three erroneous email lines, correction, read-only preview and one reviewed
  apply and a resend on phone and laptop. Device specifications include other/current-device
  revocation and administrative forced sign-out with a separate affected person. Execution remains
  P16; synthetic UI fixtures do not prove delivery.
- **P12.7's current verifier has not run against AWS:** the implemented verifier and this report
  await the coherent batch's CI gate. Real provider configuration checks, Cognito sign-in, browser
  handoff and admin MFA enrolment remain P16.8; unit checks do not prove those live behaviours.
- **P12.8 retains every owner approval:** the 28 October go/no-go, production creation/cutover and
  any January fallback/live-site rebuild are not authorised by green CI or this report.

P12.3–.6 and the reduced P12.2 can be considered for closure only when their code, written tests
and the coherent batch's CI are green. Cross-instance timing, real provider delivery, browser
acceptance and physical synthetic group cleanup are recorded in P16.8. Missing code/tests remain
with their feature step.

The pending gate also includes recovery-code issuance races against pruning/revocation and
credential-free signed-out intent on borrowed devices. Deferred API-response tests cover logout,
person changes, token renewal and interleaved refresh flights; automatic cookie recovery cannot
switch the current person. The actual group-cleanup script has ten unit cases covering pagination,
read-only planning, explicit confirmation, sequential deletion and failure propagation. These are
written regression evidence; the local gate passed and the GitHub gate remains pending.
