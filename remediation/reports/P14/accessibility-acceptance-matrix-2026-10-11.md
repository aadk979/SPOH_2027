# P14 named controls, live outcomes, and admin keyboard acceptance

Source authoring: 2026-10-11. This is the independent acceptance inventory required by P14.3/P14.4. It records executable source, not a browser pass, visual baseline approval, real-provider acceptance, or owner sign-off. ADR-011 defers suites until the whole source batch is ready; P16 owns browser execution and evidence. All entries use synthetic identities and exact fixture methods, event paths, and queries. Unexpected requests fail visibly and are asserted empty.

## Named controls and live text

`client/tests/campaign/capture-accessibility.spec.ts` and `client/tests/campaign/safety-mutation-accessibility.spec.ts` run under all four authored campaign projects: phone/laptop, light/dark. The tests require actual changed text, accessible names, and keyboard reachability; the presence of a live-region attribute alone is insufficient.

| Control/state | Named action and observable outcome | Executable acceptance source |
| --- | --- | --- |
| Registration and room-entry capture | `Guests` / `Count one entry to Room`; hidden decorative plus glyph; recorded message; local queue, undo, requeue, `1 unsynced` → `All synced`; post-send undo explains correction | capture-accessibility: two parameterised named capture/queue/undo/sync tests |
| Refused capture | Real queued request returns an explicit refusal; `1 unsynced` → `1 failed`; persistent recovery advice remains reachable | capture-accessibility: two parameterised refused queued-capture tests |
| Group +/- and total | `Add one Guests` / `Remove one Guests`; hidden glyphs; row composition changes 0/1/2; invalid card code is associated; exactly one group submission | capture-accessibility: group steppers test |
| Scanner/camera refusal | Denied camera removes the viewfinder and leaves named manual card entry usable; input error belongs to the field | capture-accessibility: camera denial/stamp test |
| Stamp | Manual invalid → corrected code; `Checking this card…` while awaiting server; duplicate warning and completed result change status text; uncertain failure queues one key and confirms on replay | capture-accessibility: camera/stamp test and parameterised retryable stamp test |
| Gift choice/redemption | Named gift selection and optional manual/no-code path; `Recording this gift handover…` while pending; warning acknowledgement and confirmed result change status; queued handover remains `1 unsynced` then `All synced`, preserving receipt and `queued:true` | capture-accessibility: gift/manual test and parameterised retryable redemption test |
| Photo/file/camera picker | Named optional Photo input, accepted formats, rear-camera hint; invalid MIME has associated alert; no false retry without retained photo | safety-mutation-accessibility: photo test |
| Photo uploading/failed/retry/attached/removed | Persistent polite status changes through idle, uploading, failure, attached, idle; failed object POST has associated safe error; `Retry photo` retains the same intent; preview has object-only alt; `Remove` clears it | safety-mutation-accessibility: photo test; screens/p14-accessibility.test.tsx persistent status regression |
| Active alert | Assertive summary names the active count; `View alerts` / `Collapse alerts` expose expansion state | safety-mutation-accessibility: lost-person test |
| Alert acknowledgement | `Acknowledge` pending disables repeat; confirmed response changes 4 to 5 acknowledged and adds acknowledgement-by-me; minimal polite result appears only after confirmation | safety-mutation-accessibility: lost-person test; screens/p14-accessibility.test.tsx acknowledgement success/failure regression |
| Alert clear | Clear review has Cancel/Escape with exact opener focus; cancellation sends nothing; confirmed resolution removes only the active alert and leaves a minimal polite success outside its disappearing banner, without descriptors | safety-mutation-accessibility: lost-person test; screens/p14-accessibility.test.tsx confirmed-clear regression |
| Stock mutation | Associated Reason validation; frozen pool/body; Cancel/Escape returns focus; pending status cannot imply success; safe failure names operation/request ID and retry; same receipt retries, then explicit saved result and dismissible polite toast | safety-mutation-accessibility: stock test |
| Shared icon controls | Visible safety/stock/shell SVG controls have nonempty accessible names, decorative SVGs are hidden, enabled controls can be reached with painted keyboard focus | safety-mutation-accessibility: visible icon controls test |

Camera and OS file-picker injection are deterministic acceptance inputs. The tests check actual manual fallback and keyboard operation around them; physical camera, assistive-technology speech, and real signed object-storage policy acceptance remain P16 evidence obligations.

## Admin keyboard workspace

`client/tests/e2e/admin-keyboard.spec.ts` explicitly overrides the inherited phone-only e2e viewport to a 1440×900 laptop and repeats light/dark. `client/tests/browser/keyboardAcceptance.ts` reaches every control with Tab, then asserts real focus, `:focus-visible`, and a painted outline/shadow. It never uses `focus()` as a substitute for keyboard traversal. Native segmented date/time fixture entry is identified explicitly; tab reach, submit, disclosure, consent, confirmation, and cancellation remain real keyboard input.

| Workspace | Required authored acceptance |
| --- | --- |
| Setup | Branding validation association; publication dialog Cancel/Escape returns exact opener without a write |
| Structure | Stations/categories/days native disclosure editors; invalid create association; reversible unused-day removal consent; shift exception controls; gift stock review; issued/unissued card lookup and handover/void/reissue review cancellation; print/export controls |
| Settings and permissions | Event name validation and correction; lifecycle readiness controls; fixed role permissions read-only; exact simulated refusal with reason |
| Content | Saved draft/preview and publication cancellation; missing essential point has associated validation |
| Schedule | Lifecycle form local invalid text; state/time association; exact create/cancel request; timeline filter and changed scheduled outcome |
| People and import | Lower-rank member Manage/withdrawal cancellation; scoped event-only review; invite field validation; CSV error association, preview and deliberate apply; person lifecycle and privacy review cancellation focus |
| Staffing | Unassign confirmation cancellation; person validation; assignment role/escalation controls |
| Swaps | Request association; decision and note controls; schema-shaped rejected outcome with saved status |
| Briefings | Day/briefer/wave/time/completion-note controls and associated validation |
| Audit | Filter controls, before/after native disclosures, and exact older-page query with safe synthetic records |
| Corrections | Consent requirement, record change resets consent, keyboard check/uncheck and no accidental mutation |
| Closeout | Explicit archive consent and blockers; disabled final-report state gives a reason and hides unavailable archive action |
| All 19 routes | Every visible enabled main control is reached with painted focus; Tab exits and Shift+Tab returns; empty unexpected-request inventory |

The shared confirmation helper verifies the deliberate short dialog cycle, Escape exit, Cancel exit, no mutation, and return to the precise opener. Separate component regressions preserve inline person lifecycle/privacy cancellation focus and frozen event-withdrawal bodies. Local scheduling validation and CSV validation remain perceivable and field-associated. Owner approval gates for destructive/platform work, branding/publication acceptance, real providers, and release decisions remain in the programme; these synthetic cancellation and consent tests do not grant those approvals.

## Verification state

Authored source and regression changes are ready for the root whole-batch verification freeze. No browser was launched by this authoring lane, no snapshots were refreshed, and no test outcome is inferred from compilation. The root must record affected-suite actual exits and retain any P16 browser/owner gates separately.
