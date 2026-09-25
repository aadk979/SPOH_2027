#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
// P03.2 — function-level refactor backlog. Run from the repo root:
//
//   node remediation/reports/P03/backlog.mjs        # writes backlog.md, exits 1 if a function has no plan
//
// One plan per function over the limits in reports/metrics/P00.json (the
// list P06/P07 work through). Keyed by the P00 location, so the list stays
// the one P00 measured. Coverage comes from reports/metrics/P00-coverage.json
// (line %, whole-src run) and, for screens, the e2e spec that visits them.
import { readFileSync, writeFileSync } from 'node:fs';

const P00 = JSON.parse(readFileSync('remediation/reports/metrics/P00.json', 'utf8'));
const COV = JSON.parse(readFileSync('remediation/reports/metrics/P00-coverage.json', 'utf8'));
const lineCov = {
  ...COV.scopes['server (all of src)'].files,
  ...COV.scopes.client.files,
};

/** Screens an e2e spec drives (client/tests/e2e). */
const E2E = {
  'client/src/app/sign-in/page.tsx': 'navigation, a11y',
  'client/src/app/home/page.tsx': 'navigation, a11y',
  'client/src/app/attendance/page.tsx': 'attendance',
  'client/src/app/capture/registration/page.tsx': 'capture, a11y',
  'client/src/app/capture/footfall/page.tsx': 'capture, a11y',
  'client/src/app/admin/users/page.tsx': 'admin',
  'client/src/app/admin/settings/page.tsx': 'admin',
  'client/src/components/LostPersonBanner.tsx': 'capture (second device)',
  'client/src/components/AppShell.tsx': 'navigation',
  'client/src/components/GlobalNav.tsx': 'navigation',
  'client/src/features/attendance/VerifierCode.tsx': 'attendance',
  'client/src/features/attendance/AttendanceScanner.tsx': 'attendance',
  'client/src/features/capture/useCapture.ts': 'capture',
  'client/src/components/ShiftOverview.tsx': 'navigation',
};

// Paths below are relative to server/src or client/src and follow
// engineering-standards §3/§4 and the module map (F03 § P03.1).
// Risk: H = capture, auth or money-like counts with thin tests; M = admin or
// read paths with some tests; L = presentational or well covered.
const S = 'server:';
const C = 'client:';
const PLANS = {
  // ── client screens ──────────────────────────────────────────────────────
  'client/src/app/reports/page.tsx:35': {
    does: 'report query; export download (fetch + blob + filename); 9 report sections rendered inline',
    split: `${C}features/reports/{api.ts: getReport, downloadExport; queries.ts: useReport; screens/ReportScreen.tsx; components/{ReportHeader, RegistrationSection, FootfallSection, CardSection, GiftSection, SafetySection, VolunteerSection, IntegritySection, ExportButton}.tsx}; model/exportFileName.ts`,
    risk: 'M',
  },
  'client/src/app/admin/settings/page.tsx:151': {
    does: 'load settings; five form-state groups; shift-row validation; save + invalidate; overridden-key display',
    split: `${C}features/settings/{api.ts, queries.ts: useSettings, useSaveSettings; screens/SettingsScreen.tsx; components/{EventNameField, ShiftBlocksForm, ThresholdsForm, PollingForm, CaptureForm}.tsx; model/validateShiftBlocks.ts} + shared form hook (P03.3)`,
    risk: 'M',
  },
  'client/src/app/chief/imports/page.tsx:52': {
    does: 'target/source choice; CSV text and file input; CSV parsing; dry-run preview; commit; result table',
    split: `${C}features/fallback/{api.ts: importRows; model/parseImportCsv.ts (pure, unit-tested); screens/ImportScreen.tsx; components/{ImportSourceForm, ImportPreview, ImportResult}.tsx; queries.ts: useImportPreview, useImportCommit}`,
    risk: 'H',
  },
  'client/src/app/attendance/page.tsx:19': {
    does: 'status query; root start; issue/rotate verifier code; QR scan; PIN entry; submit; confirmation',
    split: `${C}features/attendance/{api.ts; queries.ts: useAttendanceStatus, useStartAttendance, useIssueChallenge, useSubmitAttendance; screens/AttendanceScreen.tsx; components/{RootStart, VerifierPanel, ProofEntry (scan + PIN), PresenceConfirmed}.tsx}`,
    risk: 'H',
  },
  'client/src/app/capture/registration/group/page.tsx:35': {
    does: 'per-category stepper state; card code entry; validation; outbox enqueue; navigation back',
    split: `${C}features/registration/{screens/GroupRegistrationScreen.tsx; components/{CategorySteppers, GroupCardCode, GroupSubmitBar}.tsx; model/{groupMembers.ts, validateGroup.ts}}; enqueue through features/capture`,
    risk: 'H',
  },
  'client/src/app/ic/page.tsx:35': {
    does: 'station picker; station dashboard stats; category bars; roster ("who is here", F02-011); pending swaps query + SwapQueue',
    split: `${C}features/dashboard/{screens/IcConsoleScreen.tsx; components/{StationPicker, StationStats, WhoIsHere (keyed by assignment, F02-011), CategoryBars}.tsx}; features/swaps/components/SwapQueue.tsx + queries.ts: usePendingSwaps, useDecideSwap`,
    risk: 'M',
  },
  'client/src/app/safety/lost-found/new/page.tsx:23': {
    does: 'form state and validation; photo upload; submit; navigation',
    split: `${C}features/lostFound/{screens/NewLostFoundScreen.tsx; components/{LostFoundForm, PhotoField}.tsx; queries.ts: useLogItem} + shared form hook`,
    risk: 'L',
  },
  'client/src/app/capture/redeem/page.tsx:33': {
    does: 'gift list query; gift choice; QR scan + card code; redeem with duplicate-card confirm; result message',
    split: `${C}features/gifts/{screens/RedeemScreen.tsx; components/{GiftPicker, RedeemCardEntry, RedeemResult}.tsx; queries.ts: useGifts, useRedeemGift; model/redeemMessage.ts}`,
    risk: 'H',
  },
  'client/src/app/chief/fallback/page.tsx:36': {
    does: 'windows query; stations query; declare form; close action; window list',
    split: `${C}features/fallback/{screens/FallbackScreen.tsx; components/{DeclareFallbackForm, FallbackWindowList}.tsx; queries.ts: useFallbackWindows, useDeclareFallback, useCloseFallback}`,
    risk: 'M',
  },
  'client/src/app/chief/page.tsx:62': {
    does: 'renders every dashboard panel inline: attention, registrations, footfall, cards, gifts, staffing, safety',
    split: `${C}features/dashboard/components/{AttentionPanel, RegistrationPanel, FootfallPanel, CardFunnelPanel, GiftPanel, StaffingPanel, SafetyPanel}.tsx; DashboardBody composes them`,
    risk: 'M',
  },
  'client/src/app/admin/users/page.tsx:276': {
    does: 'role/phone/portfolio edit form; deactivate with reason; reactivate; three mutations',
    split: `${C}features/people/components/{PersonEditForm, DeactivatePerson, ReactivatePerson}.tsx; queries.ts keeps the three mutations`,
    risk: 'M',
  },
  'client/src/app/safety/incident/new/page.tsx:41': {
    does: 'type/severity/location/time form; validation; idempotent submit; navigation',
    split: `${C}features/incidents/{screens/ReportIncidentScreen.tsx; components/IncidentForm.tsx; model/incidentFormSchema.ts; queries.ts: useReportIncident}`,
    risk: 'M',
  },
  'client/src/app/safety/lost-found/page.tsx:35': {
    does: 'search debounce; held-only filter; list query; claim mutation; item cards',
    split: `${C}features/lostFound/{screens/LostFoundScreen.tsx; components/{LostFoundFilters, LostFoundItemCard}.tsx; queries.ts: useLostFoundItems, useClaimItem}; shared/hooks/useDebouncedValue.ts`,
    risk: 'L',
  },
  'client/src/app/safety/lost-person/new/page.tsx:24': {
    does: 'description/age/clothing form; validation; submit; navigation',
    split: `${C}features/lostPersons/{screens/RaiseAlertScreen.tsx; components/RaiseAlertForm.tsx; queries.ts: useRaiseAlert}`,
    risk: 'M',
  },
  'client/src/app/tv/page.tsx:25': {
    does: 'live dashboard poll; wake lock; visibility handling; four TV panels',
    split: `${C}features/dashboard/{screens/TvScreen.tsx; components/{TvRegistrations, TvFootfall, TvCards, TvSafety}.tsx}; shared/hooks/useWakeLockWhileVisible.ts`,
    risk: 'L',
  },
  'client/src/app/admin/users/page.tsx:47': {
    does: 'filters and search state; volunteer list query; editing selection; list rendering',
    split: `${C}features/people/{screens/PeopleScreen.tsx; components/{PeopleFilters, PeopleList}.tsx; queries.ts: usePeople}`,
    risk: 'M',
  },
  'client/src/app/inbox/page.tsx:127': {
    does: 'composer form (body, audience, station, ack); stations query; send mutation; error display',
    split: `${C}features/announcements/{components/{AnnouncementComposer, AudiencePicker}.tsx; queries.ts: useSendAnnouncement}; stations via features/stations/queries.ts`,
    risk: 'M',
  },
  'client/src/app/capture/stamp/page.tsx:27': {
    does: 'QR scan; card code entry; stamp request; card summary; wake lock; messages',
    split: `${C}features/missionCards/{screens/StampScreen.tsx; components/{StampCardEntry, StampResult}.tsx; queries.ts: useStampCard}`,
    risk: 'H',
  },
  'client/src/app/capture/registration/page.tsx:34': {
    does: 'category buttons; capture + undo; session and booth totals query; wake lock; sync indicator',
    split: `${C}features/registration/{screens/RegistrationScreen.tsx; components/{CategoryButtons, CaptureTotals, UndoBar}.tsx; queries.ts: useRegistrationSummary}`,
    risk: 'H',
  },
  'client/src/app/shift/page.tsx:29': {
    does: 'assignment list; outbox entries (parked captures) with copy/flush; alert delivery card',
    split: `${C}features/assignments/{screens/MyShiftScreen.tsx; components/MyAssignments.tsx}; features/capture/components/ParkedCaptures.tsx; AlertDelivery stays`,
    risk: 'M',
  },
  'client/src/components/ShiftOverview.tsx:23': {
    does: 'current shift card; attendance status query; check-in and check-out mutations with confirm',
    split: `${C}features/assignments/components/{CurrentShiftCard, CheckInButton, CheckOutButton}.tsx; queries.ts: useCheckIn, useCheckOut`,
    risk: 'H',
  },
  'client/src/features/notification/usePushRegistration.ts:66': {
    does: 'support detection; config fetch; permission request; subscribe/unsubscribe; key decoding; state machine',
    split: `${C}features/notifications/{model/{pushSupport.ts, decodeVapidKey.ts}; api.ts; hooks/{usePushConfig, usePushSubscription}.ts}`,
    risk: 'M',
  },
  'client/src/app/capture/footfall/page.tsx:28': {
    does: 'counter button; capture + undo; idle timer; wake lock; sync indicator',
    split: `${C}features/footfall/{screens/CounterScreen.tsx; components/{CounterButton, UndoBar}.tsx}; shared/hooks/useIdleTimer.ts`,
    risk: 'H',
  },
  'client/src/components/LostPersonBanner.tsx:35': {
    does: 'active alerts query; per-alert card with ack and resolve; layout of the stack (F02-016)',
    split: `${C}features/lostPersons/components/{LostPersonBanner (list + collapse), LostPersonAlertCard, AlertActions}.tsx`,
    risk: 'H',
  },
  'client/src/components/ui/Choice.tsx:34': {
    does: 'radio-group semantics, keyboard handling and option rendering in one component',
    split: `${C}shared/ui/Choice/{ChoiceGroup.tsx, ChoiceOption.tsx, useRovingFocus.ts}`,
    risk: 'L',
  },
  'client/src/components/AppShell.tsx:56': {
    does: 'layout; header; section nav; banners; skip link; path → section mapping',
    split: `${C}shared/ui/AppShell/{AppShell.tsx, AppHeader.tsx, SkipLink.tsx}; navigation/registry.ts owns sectionForPath`,
    risk: 'M',
  },
  'client/src/components/CardCodeInput.tsx:23': {
    does: 'input state; paste handling; normalisation; validation; submit',
    split: `${C}features/missionCards/{components/CardCodeInput.tsx; model/normaliseCardCode.ts (mirrors the server, F03-020)}`,
    risk: 'M',
  },
  'client/src/features/attendance/VerifierCode.tsx:8': {
    does: 'countdown timer; copy to clipboard; QR and PIN display',
    split: `${C}features/attendance/{components/{VerifierQr, VerifierPin}.tsx; hooks/useCountdown.ts}`,
    risk: 'L',
  },
  'client/src/features/media/usePhotoUpload.ts:46': {
    does: 'media config query; presign; S3 POST; preview URL lifecycle; error state',
    split: `${C}features/media/{api.ts: getMediaConfig, presignUpload, postToS3; hooks/usePhotoUpload.ts (orchestrates); model/previewUrl.ts}`,
    risk: 'L',
  },
  'client/src/components/GlobalNav.tsx:29': {
    does: 'nav items per role; active state; sign out',
    split: `${C}navigation/{registry.ts, GlobalNav.tsx, SignOutButton.tsx}`,
    risk: 'L',
  },
  'client/src/app/sign-in/page.tsx:22': {
    does: 'email/role form; hosted-UI link; session open; redirect',
    split: `${C}features/identity/{screens/SignInScreen.tsx; components/{DevSignInForm, HostedSignInLink}.tsx}`,
    risk: 'M',
  },
  'client/src/app/home/page.tsx:12': {
    does: 'me query; shift card; role tiles; operations link; error states',
    split: `${C}features/people/screens/HomeScreen.tsx composing CurrentShiftCard, RoleTiles, OperationsEntry`,
    risk: 'L',
  },
  'client/src/app/inbox/page.tsx:43': {
    does: 'inbox query; ack mutation; composer gate; list rendering',
    split: `${C}features/announcements/{screens/InboxScreen.tsx; components/AnnouncementList.tsx; queries.ts: useInbox, useAcknowledge}`,
    risk: 'L',
  },
  'client/src/components/LostPersonBanner.tsx:70': {
    does: 'one alert card inside the banner map',
    split: 'resolved by the LostPersonBanner split (LostPersonAlertCard)',
    risk: 'L',
  },
  'client/src/app/chief/page.tsx:250': {
    does: 'derives and renders every attention item (gaps, silent stations, stale devices, stock, safety)',
    split: `${C}features/dashboard/{model/attentionItems.ts (pure, unit-tested); components/AttentionPanel.tsx}`,
    risk: 'M',
  },
  'client/src/features/capture/useQrScanner.ts:32': {
    does: 'camera start/stop; decode loop; permission errors; result state',
    split: `${C}features/capture/{model/qrDecodeLoop.ts; hooks/useCamera.ts, useQrScanner.ts}`,
    risk: 'M',
  },
  'client/src/app/ic/page.tsx:222': {
    does: 'swap list; decide mutation; pending/error state',
    split: `${C}features/swaps/components/{SwapQueue, SwapRow}.tsx; queries.ts: useDecideSwap`,
    risk: 'L',
  },
  'client/src/features/capture/useCapture.ts:59': {
    does: 'enqueue to outbox; undo window timer; session count; error state',
    split: `${C}features/capture/hooks/{useCapture.ts (compose), useUndoWindow.ts, useSessionCount.ts}`,
    risk: 'H',
  },
  'client/src/components/AlertDelivery.tsx:21': {
    does: 'push state display; enable/disable actions; copy per state',
    split: `${C}features/notifications/components/{AlertDelivery, AlertDeliveryStatus}.tsx; model/deliveryCopy.ts`,
    risk: 'L',
  },
  'client/src/components/ui/Choice.tsx:75': {
    does: 'one option inside ChoiceGroup',
    split: 'resolved by the ChoiceGroup split (ChoiceOption.tsx)',
    risk: 'L',
  },
  'client/src/features/attendance/AttendanceScanner.tsx:7': {
    does: 'camera lifecycle; decode; failure fallback message',
    split: `${C}features/attendance/components/AttendanceScanner.tsx on top of features/capture/hooks/useCamera.ts`,
    risk: 'M',
  },
  'client/src/app/brief/page.tsx:19': {
    does: 'renders the compiled volunteer brief (F01 content)',
    split: `${C}features/content/screens/BriefScreen.tsx rendering a ContentDocument (P13.3); sections as components`,
    risk: 'L',
  },
  'client/src/app/admin/users/page.tsx:198': {
    does: 'one volunteer row: status chip, role label, edit toggle, editor',
    split: `${C}features/people/components/{PersonRow, PersonStatus}.tsx`,
    risk: 'L',
  },
  'client/src/app/safety/page.tsx:18': {
    does: 'safety hub tiles; escalation chain; error states',
    split: `${C}features/incidents/screens/SafetyHubScreen.tsx composing SafetyTiles and EscalationChain`,
    risk: 'L',
  },
  'client/src/components/ui/Field.tsx:64': {
    does: 'label, hint, error, required marker and aria wiring',
    split: `${C}shared/ui/Field/{Field.tsx, FieldLabel.tsx, FieldMessage.tsx}; useFieldIds.ts`,
    risk: 'L',
  },
  'client/src/components/ShiftOverview.tsx:145': {
    does: 'role-dependent tile list',
    split: `${C}navigation/registry.ts supplies tiles; features/people/components/RoleTiles.tsx maps them`,
    risk: 'L',
  },

  // ── server ──────────────────────────────────────────────────────────────
  'server/src/modules/roster/service.ts:101': {
    does: 'identity lookup and minting; volunteer upserts; manager links; assignment validation and upserts; dry run by rollback; counters; audit',
    split: `${S}modules/assignments/application/importRoster/{planRosterImport.ts (pure: rows → plan + issues), mintIdentities.ts, applyRosterImport.ts (tx), importRoster.ts (orchestrates; no dryRun flag, §1)}; people/domain/escalation.ts guards roles (F03-001)`,
    risk: 'H',
  },
  'server/src/modules/report/service.ts:68': {
    does: 'resolves the range; runs 23 queries; shapes every report section',
    split: `${S}modules/reports/application/{generateReport.ts (orchestrates), sections/{registrations, footfall, cards, gifts, safety, volunteers, integrity}.ts each: query + shape}`,
    risk: 'M',
  },
  'server/src/modules/gift/service.ts:48': {
    does: 'station check; stock check; card lookup and duplicate rules; redemption insert; audit; totals; low-stock push',
    split: `${S}modules/gifts/{domain/{remainingStock.ts, cardRedemptionWarning.ts}; application/redeemGift.ts (tx + audit); application/notifyLowStock.ts}; card lookup via missionCards/index.ts`,
    risk: 'H',
  },
  'server/src/modules/auth/service.ts:132': {
    does: 'token lookup; reuse detection and family revocation + audit; expiry and active checks; rotation tx; access-token issue; response shape',
    split: `${S}modules/identity/{application/rotateSession.ts; domain/refreshDecision.ts (pure: live/rotated-within-grace/reused/expired, F02-032); data/sessionRepo.ts: rotate (conditional update), revokeFamily; application/toSessionResponse.ts}`,
    risk: 'H',
  },
  'server/src/config/env.ts:165': {
    does: 'one zod object for 34 keys plus cross-field refinements',
    split: `${S}config/{database.ts, http.ts, auth.ts, aws.ts, attendance.ts, observability.ts} each a schema; config/index.ts merges (P01.4 split)`,
    risk: 'M',
  },
  'server/src/modules/notification/service.ts:146': {
    does: 'audience resolution; subscription lookup; payload build; send; prune dead endpoints; counters and logs',
    split: `${S}modules/notifications/{application/dispatch.ts; domain/buildPayload.ts; data/audienceRepo.ts: resolveAudience; application/sendToDevices.ts; data/subscriptionRepo.ts: pruneGone}`,
    risk: 'M',
  },
  'server/src/modules/roster/service.ts:136': {
    does: 'inner apply of importRoster',
    split: 'resolved by the importRoster split (applyRosterImport.ts)',
    risk: 'H',
  },
  'server/src/modules/missionCard/service.ts:125': {
    does: 'station checks; card lookup; duplicate stamp; issue on first stamp; stamp insert; completion; audit',
    split: `${S}modules/missionCards/{domain/{stampOutcome.ts, isComplete.ts}; application/stampCard.ts; data/repo.ts: insertStampOnce (ON CONFLICT, F03-008)}`,
    risk: 'H',
  },
  'server/src/modules/admin/service.ts:231': {
    does: 'escalation checks; manager check and cycle walk; update + audit; session revoke; Cognito group sync; cache invalidation',
    split: `${S}modules/people/{domain/escalation.ts: assertCanChange; application/{updatePerson.ts, assertNoReportingCycle.ts, syncIdentityRole.ts}}; sessions via identity/index.ts`,
    risk: 'M',
  },
  'server/src/modules/dashboard/service.ts:198': {
    does: 'station lookup; five queries; per-device rate anomaly; roster and category shaping',
    split: `${S}modules/dashboard/{application/getStationDashboard.ts; domain/deviceRate.ts (anomaly rule); data/stationDashboardRepo.ts}`,
    risk: 'M',
  },
  'server/src/modules/gift/service.ts:56': {
    does: 'transaction callback inside redeemGift',
    split: 'resolved by the redeemGift split',
    risk: 'H',
  },
  'server/src/modules/attendance/service.ts:246': {
    does: 'locking; day and person checks; attempt limiting; token/PIN verification; issuer rules; network rule; mark present',
    split: `${S}modules/attendance/{application/submitAttendance.ts; domain/{attemptWindow.ts, proofRules.ts: assertProofAccepted}; data/challengeRepo.ts}`,
    risk: 'H',
  },
  'server/src/modules/auth/router.ts:214': {
    does: 'OAuth callback: state/PKCE check, token exchange, verify, open session, cookie, redirect',
    split: `${S}modules/identity/{http/oauthRoutes.ts (thin); application/completeHostedSignIn.ts; platform/aws/cognitoOAuth.ts: exchangeCode}`,
    risk: 'H',
  },
  'server/src/modules/missionCard/service.ts:254': {
    does: 'code checks; original and replacement lookups; carry status and stamps; void original; audit',
    split: `${S}modules/missionCards/{domain/reissuePlan.ts (status to carry, LOST vs VOIDED, F03-028); application/reissueCard.ts; data/repo.ts: copyStamps}`,
    risk: 'M',
  },
  'server/src/modules/report/export.ts:352': {
    does: 'CSV for every section with its own row/section helpers',
    split: `${S}modules/reports/application/export/csv/{toCsv.ts, sections/*.ts}; shared csvRow helper`,
    risk: 'L',
  },
  'server/src/modules/dashboard/service.ts:52': {
    does: 'day lookup; 11 parallel sub-queries; staffing counts; response shape',
    split: `${S}modules/dashboard/application/{getLiveDashboard.ts (compose), liveRegistrations.ts, liveStaffing.ts}; other modules through index.ts; bounded 'today' window (F02-006)`,
    risk: 'M',
  },
  'server/src/modules/registration/service.ts:100': {
    does: 'station check; card link with status change; member rows; insert; audit; booth total',
    split: `${S}modules/registration/{domain/groupMembers.ts; application/recordGroupRegistration.ts}; card link via missionCards/index.ts linkGroupToCard (F03-004)`,
    risk: 'H',
  },
  'server/src/modules/fallback/service.ts:376': {
    does: 'dry-run vs commit branches; batch row; audit',
    split: `${S}modules/fallback/application/{planImport.ts, commitImport.ts} replacing the commit flag (§1)`,
    risk: 'H',
  },
  'server/src/modules/attendance/service.ts:251': {
    does: 'transaction callback inside submitAttendance',
    split: 'resolved by the submitAttendance split',
    risk: 'H',
  },
  'server/src/modules/fallback/service.ts:213': {
    does: 'registration import rows: station map, key, dedupe, insert',
    split: `${S}modules/fallback/{domain/importKey.ts; application/importRegistrations.ts; data/importRepo.ts: insertRegistrationIfNew} (F03-012 key)`,
    risk: 'H',
  },
  'server/src/app.ts:19': {
    does: 'trust proxy; helmet; CORS; logging; body limits; routers; error handlers',
    split: `${S}app/createApp.ts calling platform/http/{security.ts, cors.ts, logging.ts, bodyParsers.ts}; app/routes.ts registers modules`,
    risk: 'L',
  },
  'server/src/modules/fallback/service.ts:287': {
    does: 'footfall import rows: station map, key, dedupe, insert',
    split: `${S}modules/fallback/{application/importFootfall.ts; data/importRepo.ts: insertTickIfNew}`,
    risk: 'H',
  },
  'server/src/modules/shift/service.ts:50': {
    does: 'ownership check; target checks; block clash; insert; audit',
    split: `${S}modules/swaps/{domain/swapRules.ts; application/requestSwap.ts}; clash query via assignments/index.ts`,
    risk: 'M',
  },
  'server/src/modules/identity/provider.ts:62': {
    does: 'Cognito client; ensureUser (find, create, groups); disable; enable',
    split: `${S}platform/aws/cognito/{client.ts, ensureUser.ts, setUserEnabled.ts, syncGroups.ts}`,
    risk: 'M',
  },
  'server/src/modules/auth/service.ts:61': {
    does: 'volunteer load; refresh token; session row; last seen; audit; access token; response',
    split: `${S}modules/identity/application/{openSession.ts, toSessionResponse.ts}; data/sessionRepo.ts`,
    risk: 'H',
  },
  'server/src/modules/missionCard/service.ts:145': {
    does: 'transaction callback inside stampCard',
    split: 'resolved by the stampCard split',
    risk: 'H',
  },
  'server/src/modules/missionCard/service.ts:268': {
    does: 'transaction callback inside reissueCard',
    split: 'resolved by the reissueCard split',
    risk: 'M',
  },
  'server/src/modules/registration/service.ts:110': {
    does: 'transaction callback inside recordGroupRegistration',
    split: 'resolved by the recordGroupRegistration split',
    risk: 'H',
  },
  'server/src/modules/shift/service.ts:121': {
    does: 'status check; reject or clash-check and apply; audit; reload',
    split: `${S}modules/swaps/{application/{approveSwap.ts, rejectSwap.ts}; data/repo.ts: decideIfPending (conditional, F03-006)}`,
    risk: 'M',
  },
  'server/src/middleware/idempotency.ts:75': {
    does: 'key read; reserve; reuse/in-progress/abandoned/replay branches; response capture',
    split: `${S}platform/idempotency/{reserveKey.ts, classifyExisting.ts (pure), replay.ts, settle.ts, withIdempotency.ts (use-case wrapper)}`,
    risk: 'H',
  },
  'server/src/modules/fallback/service.ts:225': {
    does: 'inner apply of importRegistrations',
    split: 'resolved by the importRegistrations split',
    risk: 'H',
  },
  'server/src/modules/report/service.ts:304': {
    does: 'active count; per-station attendance, hours and no-shows',
    split: `${S}modules/reports/{domain/volunteerStats.ts (pure; past shifts only, F02-027); application/sections/volunteers.ts}`,
    risk: 'M',
  },
  'server/src/modules/admin/service.ts:330': {
    does: 'escalation check; deactivate + purge push subscriptions + audit; revoke sessions; disable identity; cache',
    split: `${S}modules/people/application/{deactivatePerson.ts, withdrawAccess.ts (sessions + identity + cache)}`,
    risk: 'M',
  },
  'server/src/modules/admin/service.ts:441': {
    does: 'three existence checks; upsert (create or move); audit',
    split: `${S}modules/assignments/application/{assignShift.ts, moveShift.ts} (moves audited with before, F03-018)`,
    risk: 'M',
  },
  'server/src/modules/report/service.ts:245': {
    does: 'incident, lost-person and lost-and-found shaping',
    split: `${S}modules/reports/application/sections/{incidents.ts, lostPersons.ts, lostFound.ts}`,
    risk: 'L',
  },
  'server/src/middleware/idempotency.ts:76': {
    does: 'async body of idempotent',
    split: 'resolved by the idempotent split',
    risk: 'H',
  },
  'server/src/modules/attendance/service.ts:92': {
    does: 'find-or-create attendance + audit; auto check-in to running shifts + audit',
    split: `${S}modules/attendance/application/markPresent.ts calling assignments/index.ts checkInRunningShifts`,
    risk: 'H',
  },
  'server/src/modules/shift/service.ts:55': {
    does: 'transaction callback inside requestSwap',
    split: 'resolved by the requestSwap split',
    risk: 'M',
  },
  'server/src/middleware/auth/index.ts:169': {
    does: 'bearer parse; own token vs provider token; session liveness; volunteer lookup; drift log; req.auth',
    split: `${S}platform/access/{authenticate.ts (compose), readBearerToken.ts, resolveSubject.ts, resolvePrincipal.ts}; caches in platform/events (P10.3)`,
    risk: 'H',
  },
  'server/src/modules/fallback/service.ts:72': {
    does: 'open-window check; insert; audit; log',
    split: `${S}modules/fallback/application/declareFallback.ts + data/repo.ts: findOpenWindow`,
    risk: 'M',
  },
  'server/src/modules/roster/service.ts:34': {
    does: 'manager lookup; identity mint; upsert + audit; cache',
    split: `${S}modules/people/application/provisionPerson.ts with domain/escalation.ts (F03-001)`,
    risk: 'H',
  },
  'server/src/middleware/idempotency.ts:77': {
    does: 'inner async IIFE of idempotent',
    split: 'resolved by the idempotent split',
    risk: 'H',
  },
  'server/src/modules/fallback/service.ts:299': {
    does: 'inner apply of importFootfall',
    split: 'resolved by the importFootfall split',
    risk: 'H',
  },
  'server/src/modules/report/export.ts:290': {
    does: 'integrity sheet: windows, imports, sources, voids',
    split: `${S}modules/reports/application/export/xlsx/integritySheet.ts`,
    risk: 'L',
  },
  'server/src/modules/report/export.ts:214': {
    does: 'safety sheet: incidents, lost persons, lost and found',
    split: `${S}modules/reports/application/export/xlsx/safetySheet.ts`,
    risk: 'L',
  },
  'server/src/middleware/auth/localProvider.ts:34': {
    does: 'local JWT issue and verify; group extraction',
    split: `${S}modules/identity/dev/{localIssuer.ts, localVerifier.ts}`,
    risk: 'L',
  },
  'server/src/modules/me/service.ts:80': {
    does: 'ownership; already-checked-in; attendance and time checks; conditional update; audit',
    split: `${S}modules/assignments/{domain/checkInRules.ts; application/checkIn.ts}`,
    risk: 'H',
  },
  'server/src/modules/announcement/service.ts:32': {
    does: 'event-wide permission; insert + audit; urgent push; decorate',
    split: `${S}modules/announcements/{application/sendAnnouncement.ts; domain/audience.ts (one audience rule for inbox, push and count, F03-014)}`,
    risk: 'M',
  },
  'server/src/modules/dashboard/repo.ts:66': {
    does: 'one raw SQL query for checked-in devices and last capture',
    split: `${S}modules/dataHealth/data/repo.ts; SQL moves to a named .sql-in-ts constant, row mapper separate`,
    risk: 'L',
  },
  'server/src/modules/incident/service.ts:32': {
    does: 'insert + audit; station name; safety push',
    split: `${S}modules/incidents/application/{reportIncident.ts, notifySafetyChain.ts}`,
    risk: 'M',
  },
  'server/src/modules/missionCard/service.ts:65': {
    does: 'card lookup; issue + audit; link group registrations; bypass audit; reload',
    split: `${S}modules/missionCards/application/{issueCard.ts, linkGroupToCard.ts}`,
    risk: 'M',
  },
};

// ── Build the table ────────────────────────────────────────────────────────
const rows = [];
const missing = [];
for (const f of P00.longFunctions) {
  const key = `${f.file}:${f.line}`;
  const plan = PLANS[key];
  if (!plan) {
    missing.push(`${key} ${f.name}`);
    continue;
  }
  const cov = lineCov[f.file];
  const e2e = E2E[f.file];
  const coverage = [cov ? `${cov.lines}% lines` : 'no data', e2e ? `e2e: ${e2e}` : null]
    .filter(Boolean)
    .join('; ');
  const where = `\`${f.file.replace(/^(server|client)\/src\//, '$1:')}:${f.line}\``;
  const name = f.name.startsWith('<') ? f.name.replace(/[<>|]/g, '').slice(0, 40) : `\`${f.name}\``;
  rows.push(
    `| ${f.lines} | ${where} | ${name} | ${plan.does} | ${plan.split} | ${plan.risk} | ${coverage} |`,
  );
}

const unused = Object.keys(PLANS).filter(
  (key) => !P00.longFunctions.some((f) => `${f.file}:${f.line}` === key),
);

const md = [
  '| Lines | Now | Function | Responsibilities it holds | Proposed split (new names → target files) | Risk | Existing coverage |',
  '| ----: | --- | -------- | ------------------------- | ----------------------------------------- | :--: | ----------------- |',
  ...rows,
].join('\n');
writeFileSync('remediation/reports/P03/backlog.md', `${md}\n`);

const byRisk = Object.groupBy(
  P00.longFunctions.filter((f) => PLANS[`${f.file}:${f.line}`]),
  (f) => PLANS[`${f.file}:${f.line}`].risk,
);
console.log(
  `${rows.length} of ${P00.longFunctions.length} flagged functions have a plan ` +
    `(H ${byRisk.H?.length ?? 0}, M ${byRisk.M?.length ?? 0}, L ${byRisk.L?.length ?? 0})`,
);
for (const m of missing) console.log(`  missing: ${m}`);
for (const u of unused) console.log(`  plan for a function not in P00: ${u}`);
if (missing.length || unused.length) process.exit(1);
