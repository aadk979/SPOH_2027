# Event operator quick note

For the 6–9 January 2027 open house. Read [the release plan](EVENT_RELEASE_PLAN.md) for E1–E5. This note describes operating steps; it is not evidence that a journey, deployment, rollback or alert delivery passed. The owner decision remains 28 October 2026.

## Before opening

Use the event's normal sign-in, assigned station and selected operational day. Confirm the displayed event and station before recording anything. Check that registration, room-entry and gift figures have their own units. A person entering a room is not another registration. Check current gift stock separately from date-filtered redemption totals.

The operator should have the approved staff contact list, a phone/radio, numbered paper tally sheets and the printed station/day list. Keep personal contact and lost-person information out of shared screenshots and public paper lists. The alert channel used on event day needs an actual receipt check; until that is recorded, use the agreed phone/radio fallback.

## Interrupted capture or connectivity

If a capture is queued, leave it queued and reconnect once. Check that the queue clears and the server count changes once before continuing. Do not re-enter the same queued capture from another device. If the queue does not clear, stop that device's capture work, retain it for investigation, and switch to paper at a recorded time.

Keep separate registration and room-entry tallies, with event, operational day, station, start/end time, recorder and a unique sheet number. Record gift handovers and card codes on the controlled desk sheet so staff can check whether a gift has already been issued. Do not keep handing out gifts against an uncertain stock balance. Escalate count/stock discrepancies to the event lead.

Before any approved paper backfill, reconcile the server's confirmed captures and pending device queues against the sheet. One responsible operator imports each sheet once and records its reference and result. Do not turn a connection failure into duplicate entries by retrying with new identifiers.

## Reports and close

Choose the required day and station, then check that summary/report/export filters agree. Preserve the distinction between daily redemptions and current stock. If totals look wrong, record the filter, unit and observation time without including personal details; retain the paper tally for comparison. Export only through an authorized role and keep the file in the approved private location. Sign out when the station closes.

## Staging release and rollback

Record the intended commit and require every full CI job for that exact SHA to pass, including PostgreSQL integration and the unchanged coverage/security guards. Refresh current budget and runtime eligibility in a finite recorded scope. Use the existing staging workflow for that exact SHA, retaining stable session-signing versions. Never create production or alter resource sizing as part of this procedure.

After deployment, record the actual image digest/task definition and smoke outcome. Check sign-in and the affected day-filtered summaries before admitting broader test traffic. If a required flow regresses, stop that traffic and preserve failed observations.

The summary repair adds no schema migration. The prior accepted application commit `c4bc73fd6f2e66503565cb776679eef302740232` is the planned compatible staging rollback target. Before the rehearsal, check that no later schema or signing change makes it incompatible. Dispatch the existing staging workflow once for the target SHA, retain the current stable signing versions, and verify the actual deployed image and smoke result. This temporarily restores the known day-filter defect: do not treat it as the final event release. Redeploy the exact-green candidate once and repeat its smoke/changed-flow checks. Preserve both deployment receipts. A failed or unknown dispatch must be reconciled before another submission.

CDK currently declares seven days of RDS automated backups with deletion protection and a versioned private object bucket. Those source settings are preparation evidence only: confirm the live backup configuration/horizon and required export access in E5. A timed restore campaign is not an event launch prerequisite.
