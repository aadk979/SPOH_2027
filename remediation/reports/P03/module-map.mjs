#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
// P03.1 — module map. Run from the repo root:
//
//   node remediation/reports/P03/module-map.mjs            # writes module-map.json + module-map.md
//
// For every server unit (module, lib file, middleware) it records the exported
// functions, the inbound and outbound edges to other units and the boundary
// violations dependency-cruiser reports, and gives every exported declaration a
// target location per engineering-standards §3 and target-architecture §1.
// The targets are rules (below), not guesses per row: a reviewer changes a rule
// and re-runs rather than editing the output.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { walk, exportsOf } from './exports.mjs';

const OUT = 'remediation/reports/P03';

// ── Unit of a file: modules/<m>, lib/<file>, middleware[/auth], or the root ──
function unitOf(path) {
  const rel = path.replace(/^server\/src\//, '');
  const m = rel.match(/^modules\/([^/]+)\//);
  if (m) return `modules/${m[1]}`;
  if (rel.startsWith('lib/')) return rel.replace(/\.ts$/, '');
  if (rel.startsWith('middleware/auth/')) return 'middleware/auth';
  if (rel.startsWith('middleware/')) return rel.replace(/\.ts$/, '');
  return rel.replace(/\.ts$/, '');
}

// ── Target domain per module (target-architecture §1) ───────────────────────
// `null` means the module dissolves and every export needs an override.
const DOMAIN = {
  admin: null,
  announcement: 'announcements',
  attendance: 'attendance',
  audit: 'platform/audit',
  auth: 'identity',
  dashboard: 'dashboard',
  devAuth: 'identity',
  fallback: 'fallback',
  footfall: 'footfall',
  gift: 'gifts',
  health: 'platform/http',
  identity: 'identity',
  incident: 'incidents',
  lostFound: 'lostFound',
  lostPerson: 'lostPersons',
  me: 'people',
  media: 'media',
  missionCard: 'missionCards',
  notification: 'notifications',
  registration: 'registration',
  report: 'reports',
  roster: 'assignments',
  shift: 'swaps',
  station: 'stations',
};

// ── Platform targets for lib/ and middleware/ (engineering-standards §3) ────
const PLATFORM = {
  'lib/audit': 'platform/audit/writeAudit.ts',
  'lib/campusNetwork': 'modules/attendance/domain/campusNetwork.ts',
  'lib/captureActor': 'platform/http/captureActor.ts',
  'lib/errors': 'platform/errors/index.ts',
  'lib/logger': 'platform/logger/index.ts',
  'lib/prisma': 'platform/db/client.ts',
  'lib/requestContext': 'platform/http/auditContext.ts',
  'lib/settings': 'platform/settings/',
  'lib/shortCode': 'modules/missionCards/domain/shortCode.ts',
  'lib/time': 'platform/time/',
  'middleware/auth': 'platform/access/authenticate.ts',
  'middleware/errorHandler': 'platform/http/errorHandler.ts',
  'middleware/idempotency': 'platform/idempotency/',
  'middleware/rateLimit': 'platform/http/rateLimit.ts',
  'middleware/rbac': 'platform/access/',
  'middleware/requestId': 'platform/http/requestId.ts',
  'middleware/validate': 'platform/http/validate.ts',
  'config/env': 'config/',
  'jobs/scheduler': 'platform/scheduler/',
  app: 'app/createApp.ts',
  routes: 'app/routes.ts',
  index: 'main.ts',
};

// ── Per-export overrides: dissolving modules, misplaced helpers, dead code ──
// `DEAD` = no production caller (P03.1 scan); delete in P06 unless a phase
// named in F03 revives it.
const DEAD = 'delete (no production caller)';
const OVERRIDE = {
  // admin dissolves into five domains
  'modules/admin/service.ts#listVolunteers': 'modules/people/application/listPeople.ts',
  'modules/admin/service.ts#getVolunteer': 'modules/people/application/getPerson.ts',
  'modules/admin/service.ts#updateVolunteer': 'modules/people/application/updatePerson.ts',
  'modules/admin/service.ts#deactivateVolunteer': 'modules/people/application/deactivatePerson.ts',
  'modules/admin/service.ts#reactivateVolunteer': 'modules/people/application/reactivatePerson.ts',
  'modules/admin/service.ts#createAssignment': 'modules/assignments/application/assignShift.ts',
  'modules/admin/service.ts#deleteAssignment': 'modules/assignments/application/unassignShift.ts',
  'modules/admin/service.ts#createStation': 'modules/stations/application/createStation.ts',
  'modules/admin/service.ts#updateStation': 'modules/stations/application/updateStation.ts',
  'modules/admin/service.ts#listEventDays': 'modules/eventDays/application/listEventDays.ts',
  'modules/admin/service.ts#createEventDay': 'modules/eventDays/application/createEventDay.ts',
  'modules/admin/service.ts#updateEventDay': 'modules/eventDays/application/updateEventDay.ts',
  'modules/admin/service.ts#createGiftType': 'modules/gifts/application/createGiftType.ts',
  'modules/admin/service.ts#updateGiftType': 'modules/gifts/application/updateGiftType.ts',
  'modules/admin/service.ts#assertCanActOn': `${DEAD}; the rule lives in modules/people/domain/escalation.ts`,
  'modules/admin/router.ts#adminRouter':
    'split: people, assignments, stations, eventDays, gifts http/routes.ts; settings → platform/settings/http',
  // roster: provisioning is people, the CSV import and station roster are assignments
  'modules/roster/service.ts#provisionVolunteer': 'modules/people/application/provisionPerson.ts',
  'modules/roster/repo.ts#toVolunteerRecord': 'modules/people/data/mappers.ts',
  'modules/roster/repo.ts#findVolunteerByEmail': 'modules/people/data/repo.ts',
  'modules/roster/repo.ts#upsertVolunteer': 'modules/people/data/repo.ts',
  'modules/roster/service.ts#importRoster':
    'modules/assignments/application/importRoster/ (planImport.ts + applyImport.ts)',
  'modules/roster/router.ts#rosterRouter':
    'split: people/http (POST /volunteers), assignments/http (import, station roster, GET /me alias)',
  // shift: swaps, briefings, staffing
  'modules/shift/service.ts#getBriefingSlots': 'modules/briefings/application/listBriefingSlots.ts',
  'modules/shift/service.ts#markSlotComplete':
    'modules/briefings/application/completeBriefingSlot.ts',
  'modules/shift/repo.ts#toBriefingSlotRecord': 'modules/briefings/data/mappers.ts',
  'modules/shift/repo.ts#listBriefingSlots': 'modules/briefings/data/repo.ts',
  'modules/shift/repo.ts#findSlotById': 'modules/briefings/data/repo.ts',
  'modules/shift/repo.ts#completeSlot': 'modules/briefings/data/repo.ts',
  'modules/shift/service.ts#getStaffingGaps': 'modules/assignments/application/getStaffingGaps.ts',
  'modules/shift/service.ts#getLongShifts': 'modules/assignments/application/getLongShifts.ts',
  'modules/shift/repo.ts#staffingByStation': 'modules/assignments/data/repo.ts',
  'modules/shift/repo.ts#longRunningShifts': 'modules/assignments/data/repo.ts',
  'modules/shift/service.ts#LONG_SHIFT_MINUTES': `${DEAD} (read the setting)`,
  'modules/shift/router.ts#shiftRouter':
    'split: swaps/http, briefings/http, assignments/http (gaps)',
  // me: the volunteer's own view and check-in/out
  'modules/me/service.ts#checkIn': 'modules/assignments/application/checkIn.ts',
  'modules/me/service.ts#checkOut': 'modules/assignments/application/checkOut.ts',
  'modules/me/service.ts#toMyAssignment': 'modules/assignments/data/mappers.ts',
  'modules/me/service.ts#setAssignmentCheckIn': `${DEAD} (re-export)`,
  'modules/me/service.ts#setAssignmentCheckOut': `${DEAD} (re-export)`,
  'modules/me/repo.ts#setAssignmentCheckIn': DEAD,
  'modules/me/repo.ts#setAssignmentCheckOut': DEAD,
  'modules/me/repo.ts#findAssignmentById': 'modules/assignments/data/repo.ts',
  'modules/me/repo.ts#listAssignmentsForVolunteer': 'modules/assignments/data/repo.ts',
  'modules/me/repo.ts#buildEscalationChain':
    'modules/people/application/escalationChain.ts (walk) + data/repo.ts (one query)',
  // auth: sessions stay in identity; cookie/OAuth plumbing is http
  'modules/auth/router.ts#REFRESH_COOKIE_NAME': DEAD,
  'modules/auth/router.ts#accessTokenTtlSeconds': DEAD,
  'modules/auth/router.ts#refreshSessionDays': DEAD,
  'modules/auth/service.ts#revokeFamily': 'modules/identity/data/repo.ts (internal; not exported)',
  'modules/auth/service.ts#pruneRefreshSessions': 'modules/identity/jobs.ts',
  // report: export writers are their own files
  'modules/report/export.ts#toXlsx':
    'modules/reports/application/export/xlsx/ (one file per sheet)',
  'modules/report/export.ts#toCsv': 'modules/reports/application/export/csv.ts',
  // dashboard / footfall / lostPerson constants duplicated from settings
  'modules/dashboard/service.ts#SILENT_STATION_MINUTES': `${DEAD} (re-export; read the setting)`,
  'modules/dashboard/service.ts#STALE_DEVICE_MINUTES': `${DEAD} (read the setting)`,
  'modules/dashboard/service.ts#getDataHealth': 'modules/dataHealth/application/getDataHealth.ts',
  'modules/dashboard/repo.ts#footfallSince': DEAD,
  'modules/footfall/service.ts#SILENT_STATION_MINUTES': 'read platform/settings (constant retired)',
  'modules/lostPerson/service.ts#PURGE_AFTER_HOURS': 'read platform/settings (constant retired)',
  'modules/lostPerson/service.ts#purgeResolvedAlerts': 'modules/lostPersons/jobs.ts',
  'modules/incident/service.ts#getIncident':
    'modules/incidents/application/getIncident.ts (no route yet; F02-015 gives it one)',
  'modules/missionCard/repo.ts#findCardById': DEAD,
  'modules/missionCard/service.ts#toRecord': 'modules/missionCards/data/mappers.ts',
  'modules/station/repo.ts#findStationByCode': DEAD,
  'modules/fallback/repo.ts#rangeOverlapsFallbackWindow':
    'modules/fallback/index.ts (public: used by four capture modules)',
  // identity provider is AWS plumbing behind the identity module
  'modules/identity/provider.ts#identityProvider':
    'platform/aws/cognito.ts behind modules/identity/index.ts',
  'modules/devAuth/router.ts#createDevAuthRouter': 'modules/identity/http/devRoutes.ts',
  'modules/health/router.ts#healthRouter': 'platform/http/health.ts',
  'modules/audit/router.ts#auditRouter':
    'platform/audit/http/routes.ts + application/listAuditEntries.ts + data/repo.ts',
  // lib / middleware dead code
  'config/env.ts#parseEnv': 'config/ (test seam; keep, add a test)',
  'lib/errors.ts#ServiceUnavailableError': DEAD,
  'lib/logger.ts#requestLogger': DEAD,
  'lib/settings.ts#clearSettings': 'platform/settings/ (no caller: P10 revert uses it or it goes)',
  'lib/settings.ts#overrideSettingsForTest': 'platform/settings/testing.ts (no caller)',
  'lib/shortCode.ts#SHORT_CODE_SPACE': DEAD,
  'lib/time.ts#EVENT_TIME_ZONE': 'retired by P09 (Event.timeZone)',
  'lib/time.ts#SHIFT_BLOCKS': `${DEAD} (compiled defaults; P09 block rows)`,
  'lib/time.ts#singaporeHourStart': DEAD,
  'lib/time.ts#floorToBucket': DEAD,
  'lib/time.ts#shiftBlockRanges': 'platform/time/ (internal)',
  'lib/time.ts#singaporeMinuteOfDay': 'platform/time/ (internal)',
  'middleware/auth/index.ts#invalidateSessionCache':
    'platform/access/ (no caller: F03 bug, revokes should call it; P10.3 cache bus)',
  'middleware/errorHandler.ts#describeCause': DEAD,
  'middleware/idempotency.ts#IDEMPOTENCY_RETENTION_DAYS': DEAD,
  'middleware/rbac.ts#requireMinimumRole': DEAD,
  'middleware/rbac.ts#stationIdFromParams': DEAD,
  'middleware/rbac.ts#stationIdFromBody': 'platform/access/ (internal default)',
};

function defaultTarget(file, row) {
  const rel = file.replace(/^server\/src\//, '');
  const unit = unitOf(file);
  if (!rel.startsWith('modules/')) {
    const base = PLATFORM[unit] ?? '?';
    return base.endsWith('/') ? `${base}${row.name}.ts` : base;
  }
  const [, mod, name] = rel.match(/^modules\/([^/]+)\/(.+)\.ts$/);
  const domain = DOMAIN[mod];
  const root = domain?.startsWith('platform/') ? domain : `modules/${domain}`;
  if (name === 'router') return `${root}/http/routes.ts + handlers.ts`;
  if (name === 'repo')
    return /^to[A-Z]/.test(row.name) ? `${root}/data/mappers.ts` : `${root}/data/repo.ts`;
  if (name === 'service')
    return row.kind === 'function'
      ? `${root}/application/${row.name}.ts`
      : `${root}/domain/constants.ts`;
  if (name === 'tokens') return `${root}/domain/tokens.ts`;
  if (name === 'export') return `${root}/application/export/`;
  if (name === 'provider') return 'platform/aws/cognito.ts';
  return `${root}/${name}.ts`;
}

// ── Exports ─────────────────────────────────────────────────────────────────
const exportsByUnit = new Map();
for (const file of walk('server/src')) {
  for (const row of exportsOf(file)) {
    if (row.kind === 'type') continue;
    const key = `${file.replace(/^server\/src\//, '')}#${row.name}`;
    const target = OVERRIDE[key] ?? defaultTarget(file, row);
    const unit = unitOf(file);
    if (!exportsByUnit.has(unit)) exportsByUnit.set(unit, []);
    exportsByUnit.get(unit).push({
      file: file.replace(/^server\/src\//, ''),
      line: row.line,
      name: row.name,
      kind: row.kind,
      lines: row.lines,
      target,
    });
  }
}

// ── Edges and violations from dependency-cruiser ───────────────────────────
const cruise = JSON.parse(
  execFileSync(
    'npx',
    [
      'depcruise',
      'server/src',
      '--config',
      '.dependency-cruiser.cjs',
      '--exclude',
      '^server/src/generated',
      '--output-type',
      'json',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ),
);

const units = new Map();
const unit = (name) => {
  if (!units.has(name)) units.set(name, { out: new Set(), in: new Set(), violations: {} });
  return units.get(name);
};

for (const mod of cruise.modules) {
  if (!mod.source.startsWith('server/src/')) continue;
  const from = unitOf(mod.source);
  unit(from);
  for (const dep of mod.dependencies) {
    if (!dep.resolved.startsWith('server/src/') || dep.resolved.includes('/generated/')) continue;
    const to = unitOf(dep.resolved);
    if (to === from) continue;
    unit(from).out.add(to);
    unit(to).in.add(from);
  }
}
for (const v of cruise.summary.violations) {
  if (!v.from.startsWith('server/src/')) continue;
  const u = unit(unitOf(v.from));
  u.violations[v.rule.name] = (u.violations[v.rule.name] ?? 0) + 1;
}

const result = [...units.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, u]) => ({
    unit: name,
    outbound: [...u.out].sort(),
    inbound: [...u.in].sort(),
    violations: u.violations,
    exports: exportsByUnit.get(name) ?? [],
  }));

writeFileSync(`${OUT}/module-map.json`, `${JSON.stringify(result, null, 2)}\n`);

// ── Markdown: one row per exported declaration ─────────────────────────────
const lines = [
  '| Unit | Export | Kind | Lines | Now | Target |',
  '| ---- | ------ | ---- | ----: | --- | ------ |',
];
let count = 0;
for (const u of result) {
  for (const e of u.exports) {
    lines.push(
      `| ${u.unit} | \`${e.name}\` | ${e.kind} | ${e.lines} | \`${e.file}:${e.line}\` | ${e.target} |`,
    );
    count += 1;
  }
}
writeFileSync(`${OUT}/module-map.md`, `${lines.join('\n')}\n`);
const unmapped = result
  .flatMap((u) => u.exports)
  .filter((e) => e.target.includes('?') || e.target.includes('undefined'));
console.log(
  `${result.length} units, ${count} exported declarations, ${unmapped.length} without a target`,
);
if (unmapped.length) {
  for (const e of unmapped) console.log(`  unmapped: ${e.file}#${e.name}`);
  process.exit(1);
}
