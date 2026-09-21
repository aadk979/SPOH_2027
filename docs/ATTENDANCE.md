# Verified attendance

Attendance is recorded once per configured event day (Singapore date). The root
admin opens the day by confirming they are physically present. All other Admins,
Leads, Chief Coordinators, Deputy Coordinators and ICs are excos: they scan the
root's QR or enter the root's PIN before they may issue codes to volunteers.
Volunteers may use either the root's code or a verified exco's code. Excos cannot
verify other excos, and volunteers cannot issue codes.

The Attendance screen is linked from Home and My shift. Submit attendance opens
the rear camera scanner, with a secondary PIN field available alongside it.
Successful verification also checks in any of the person's currently running
shifts. Later shifts can be started from Home using the same day's verified
attendance. Checkout still records the end of an individual shift.

## Deployment configuration

- Set `ATTENDANCE_ROOT_EMAIL` before seeding; that address becomes the seeded
  ADMIN and the attendance trust root. It must correspond to the authenticated
  roster account. Set `SEED_ADMIN_SUB` to its real identity subject in production.
- Set `ATTENDANCE_SP_CIDRS` to the public egress IPv4/IPv6 CIDRs supplied by SP IT.
  Multiple CIDRs form one approved campus network; the two phones need not share
  an exact IP or subnet. No ranges are guessed. An empty list rejects all QR
  verification, while PIN verification remains available.
- Configure `TRUST_PROXY_HOPS` for the actual deployment and restrict direct
  access to the API behind the trusted ingress. IPs come exclusively from
  Express's trusted connection/proxy handling, never from the request body.
- Use the same `ATTENDANCE_SIGNING_SECRET` on every API instance (32+ random
  characters), or leave it unset to derive a separate key from the existing
  production `SESSION_SIGNING_SECRET`. Without either key, development uses an
  ephemeral key and restarts invalidate all issued codes.
- Run `npm run db:deploy --workspace server` and regenerate/build the Prisma
  client before starting the updated application.

## Verification rules

QRs contain a signed HS256 JWT restricted to the attendance issuer and audience,
with an event-day ID, verifier ID, unique challenge ID and five-minute expiry.
The server also checks the persisted challenge, the verifier's current account
and role, and their verified attendance. Both the issuing request and scanning
request must originate from the approved campus network.

The random 10-digit secondary PIN expires with the QR. It can be entered without
scanning and bypasses only the network check; identity, event, verifier and expiry
checks still apply. It needs working internet, including mobile data. PINs are
stored only as keyed hashes. Each account gets at most five verification
attempts per five-minute window, persisted in Postgres across instances and
restarts. QR/PIN responses are not cached or placed in the offline outbox.

Generating a fresh code revokes the issuer's previous QR and PIN. Multiple people
can use a live verifier code; each person gets at most one attendance record per
day. Transactions and per-person locks prevent duplicate attendance/audit writes.
An audit records the verifier and method without storing the token or PIN.
The old unverified shift check-in endpoint now requires today's attendance and
a currently running shift. Existing shift timestamps are not accepted as proof
that an exco is authorized to issue attendance codes.

This is supervised attendance: the root's initial presence is an explicit
attestation. Shared codes and PINs can be forwarded, and campus egress IPs cannot
prove physical proximity (for example, a campus VPN may share that egress).
Verifiers should display or give codes only to people physically present.
