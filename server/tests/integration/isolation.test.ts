import type { Express, Router } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { EVENT_ROUTES } from '../../src/app/routes.js';
import { createEvent } from '../../src/modules/event/index.js';
import type { EventScope } from '../../src/platform/db/eventScope.js';
import { eventDayAnchor } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * Cross-event isolation (P09.7, ADR-001 "How it is tested" 1).
 *
 * Two events exist. A caller who administers event A, working under A's path,
 * names ids that belong to event B, and must get 404 for every one: the answer
 * for a foreign id is the answer for an id that does not exist. And under B's
 * path, where the caller has no membership, every route answers 404.
 *
 * The cases are keyed by the route inventory, read from the routers
 * themselves: a route added without a case here fails the first test, so the
 * suite covers 100 % of routes by construction.
 */

// ── The inventory ───────────────────────────────────────────────────────────

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: unknown };
}

function inventory(): string[] {
  const routes = new Set<string>();
  for (const { path, router } of EVENT_ROUTES) {
    for (const layer of (router as Router & { stack: Layer[] }).stack) {
      if (layer.handle?.stack) throw new Error(`nested router under ${path}: list its routes`);
      if (!layer.route) continue;
      const sub = layer.route.path === '/' ? '' : layer.route.path;
      for (const method of Object.keys(layer.route.methods)) {
        routes.add(`${method.toUpperCase()} ${path}${sub}`);
      }
    }
  }
  return [...routes].sort();
}

// ── Event B's rows ──────────────────────────────────────────────────────────

interface EventB {
  scope: EventScope;
  person: string;
  station: string;
  day: string;
  shift: string;
  template: string;
  assignment: string;
  registration: string;
  tick: string;
  incident: string;
  alert: string;
  found: string;
  card: { shortCode: string; qrPayload: string };
  giftType: string;
  announcement: string;
  announcementDraft: string;
  announcementSchedule: string;
  swap: string;
  slot: string;
  window: string;
  visitorField: string;
  reportSnapshot: string;
}

async function createEventB(): Promise<EventScope> {
  const organisation = await rawDb.organisation.findUniqueOrThrow({
    where: { slug: 'test-organisation' },
  });
  const event = await createEvent({
    organisationId: organisation.id,
    slug: 'event-b',
    name: 'Event B',
    timezone: 'Asia/Singapore',
    status: 'LIVE',
    categories: [{ code: 'SEC_1', label: 'Sec 1' }],
    stationTypes: [{ code: 'OTHER', label: 'Other', registersVisitors: true, redeemsGifts: true }],
    shiftTemplates: [
      { code: 'MORNING', label: 'Morning', startLocal: '09:30', endLocal: '14:00' },
      { code: 'AFTERNOON', label: 'Afternoon', startLocal: '13:30', endLocal: '18:00' },
    ],
  });
  return { eventId: event.id };
}

async function personIn(scope: EventScope, email: string): Promise<string> {
  const person = await rawDb.person.create({
    data: { email, displayName: email, cognitoSub: `local:${email}` },
  });
  await rawDb.eventMembership.create({
    data: { eventId: scope.eventId, personId: person.id, role: 'VOLUNTEER' },
  });
  return person.id;
}

async function seedEventB(): Promise<EventB> {
  const scope = await createEventB();
  const { eventId } = scope;
  const person = await personIn(scope, 'b-one@isolation.test');
  const other = await personIn(scope, 'b-two@isolation.test');
  const type = await rawDb.stationType.findFirstOrThrow({ where: { eventId } });
  const station = await rawDb.station.create({
    data: { eventId, typeId: type.id, code: 'B-DESK', name: 'B desk' },
  });
  // Days are unique by date until P09.10: B's is the day after A's.
  const day = await rawDb.eventDay.create({
    data: { eventId, date: eventDayAnchor('2027-01-08'), label: 'B day' },
  });
  const templates = await rawDb.shiftTemplate.findMany({
    where: { eventId },
    orderBy: { sortOrder: 'asc' },
  });
  const [morning, afternoon] = await Promise.all(
    templates.map((template) =>
      rawDb.shift.create({
        data: {
          eventId,
          eventDayId: day.id,
          templateId: template.id,
          startsAt: FROZEN_NOW,
          endsAt: FROZEN_NOW,
        },
      }),
    ),
  );
  const assignment = await rawDb.shiftAssignment.create({
    data: {
      eventId,
      volunteerId: person,
      stationId: station.id,
      eventDayId: day.id,
      shiftId: (morning as { id: string }).id,
      roleLabel: 'Volunteer',
    },
  });
  const common = { eventId, stationId: station.id, recordedById: person };
  const category = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId } });
  const registration = await rawDb.registration.create({
    data: { ...common, categoryId: category.id, idempotencyKey: idempotencyKey() },
  });
  const tick = await rawDb.footfallTick.create({
    data: { ...common, idempotencyKey: idempotencyKey() },
  });
  const incident = await rawDb.incident.create({
    data: {
      eventId,
      type: 'ILLNESS',
      severity: 'LOW',
      description: 'B incident',
      reportedById: person,
      occurredAt: FROZEN_NOW,
      idempotencyKey: idempotencyKey(),
    },
  });
  const alert = await rawDb.lostPersonAlert.create({
    data: { eventId, raisedById: person, descriptionText: 'B child' },
  });
  const found = await rawDb.lostFoundItem.create({
    data: { eventId, itemLabel: 'B umbrella', foundAt: FROZEN_NOW, loggedById: person },
  });
  const card = await rawDb.missionCard.create({
    data: { eventId, shortCode: 'BBBB22', qrPayload: 'isolation-b-card', status: 'ISSUED' },
  });
  const giftType = await rawDb.giftType.create({
    data: { eventId, name: 'B tote', initialStock: 10 },
  });
  const announcement = await rawDb.announcement.create({
    data: { eventId, body: 'B notice', authorId: person, requiresAck: true },
  });
  const membership = await rawDb.eventMembership.findUniqueOrThrow({
    where: { eventId_personId: { eventId, personId: person } },
  });
  const announcementDraft = await rawDb.announcementDraft.create({
    data: {
      eventId,
      body: 'B private draft',
      authorId: person,
      authorMembershipId: membership.id,
    },
  });
  const announcementSchedule = await rawDb.scheduledAction.create({
    data: {
      eventId,
      type: 'announcement.publish',
      payload: { draftId: announcementDraft.id, expectedVersion: 1 },
      createdByPersonId: person,
      runAt: new Date(FROZEN_NOW.getTime() + 60_000),
    },
  });
  const swap = await rawDb.shiftSwapRequest.create({
    data: { eventId, assignmentId: assignment.id, requesterId: person, targetId: other },
  });
  const slot = await rawDb.briefingSlot.create({
    data: { eventId, eventDayId: day.id, startsAt: FROZEN_NOW },
  });
  const window = await rawDb.fallbackWindow.create({
    data: { eventId, tier: 3, startedAt: FROZEN_NOW, declaredById: person, reason: 'B outage' },
  });
  const visitorField = await rawDb.visitorField.create({
    data: {
      eventId,
      code: 'b_field',
      label: 'B field',
      type: 'text',
      classification: 'visitor-personal',
      retentionDays: 7,
      readers: ['ADMIN'],
    },
  });
  const reportSnapshot = await rawDb.reportSnapshot.create({
    data: {
      eventId,
      kind: 'DAILY',
      lifecycleVersion: 0,
      dedupeKey: 'daily:isolation',
      report: { range: { from: null, to: null } },
    },
  });
  return {
    scope,
    shift: (afternoon as { id: string }).id,
    template: (templates[0] as { id: string }).id,
    person,
    station: station.id,
    day: day.id,
    assignment: assignment.id,
    registration: registration.id,
    tick: tick.id,
    incident: incident.id,
    alert: alert.id,
    found: found.id,
    card: { shortCode: card.shortCode, qrPayload: card.qrPayload },
    giftType: giftType.id,
    announcement: announcement.id,
    announcementDraft: announcementDraft.id,
    announcementSchedule: announcementSchedule.id,
    swap: swap.id,
    slot: slot.id,
    window: window.id,
    visitorField: visitorField.id,
    reportSnapshot: reportSnapshot.id,
  };
}

// ── The cases ───────────────────────────────────────────────────────────────

interface IdCase {
  params?: (b: EventB) => Record<string, string>;
  body?: (b: EventB) => object;
  /**
   * A filter: a foreign id must answer exactly as an id that does not exist
   * (an empty list, never B's rows), rather than 404.
   */
  query?: (b: EventB) => Record<string, string>;
}

/** A route that takes no id of an event-owned row, with the reason. */
interface NoId {
  noId: string;
}

type Case = IdCase | NoId;

const capture = () => ({ idempotencyKey: idempotencyKey() });
const noId = (reason: string): NoId => ({ noId: reason });
const LIST = noId('lists the path event only');
const ACTOR = noId("acts on the caller's own records in the path event");

const CASES: Record<string, Case> = {
  'GET /lifecycle': LIST,
  'GET /lifecycle/readiness': LIST,
  'GET /schedules': LIST,
  'POST /lifecycle': noId(
    'transitions only the event named in the path; no body event id is accepted',
  ),
  'GET /me': ACTOR,
  'POST /me/check-in': { body: (b) => ({ assignmentId: b.assignment }) },
  'POST /me/check-out': { body: (b) => ({ assignmentId: b.assignment }) },

  'GET /attendance': ACTOR,
  'POST /attendance/start': ACTOR,
  'POST /attendance/challenge': ACTOR,
  'POST /attendance/submit': noId(
    'the proof is a signed token or PIN, checked against the path event',
  ),

  'GET /stations': LIST,

  'POST /registrations': {
    body: (b) => ({ ...capture(), category: 'SEC_1', stationId: b.station }),
  },
  'POST /registrations/group': {
    body: (b) => ({
      ...capture(),
      stationId: b.station,
      members: [{ category: 'SEC_1', count: 2 }],
    }),
  },
  'POST /registrations/:id/void': {
    params: (b) => ({ id: b.registration }),
    body: () => ({ reason: 'isolation check' }),
  },
  'GET /registrations/summary': { query: (b) => ({ stationId: b.station }) },
  'GET /registrations/categories': LIST,

  'POST /footfall/ticks': { body: (b) => ({ ...capture(), stationId: b.station }) },
  'POST /footfall/bulk': {
    body: (b) => ({
      ...capture(),
      stationId: b.station,
      quantity: 5,
      timeBlockStart: FROZEN_NOW.toISOString(),
      source: 'PAPER',
      reason: 'isolation check',
    }),
  },
  'POST /footfall/ticks/:id/void': {
    params: (b) => ({ id: b.tick }),
    body: () => ({ reason: 'isolation check' }),
  },
  'GET /footfall/summary': { query: (b) => ({ stationId: b.station }) },
  'GET /footfall/live': LIST,

  'POST /incidents': {
    body: (b) => ({
      ...capture(),
      type: 'ILLNESS',
      severity: 'LOW',
      stationId: b.station,
      description: 'isolation check',
      occurredAt: FROZEN_NOW.toISOString(),
    }),
  },
  'GET /incidents': LIST,
  'POST /incidents/:id/follow-ups': {
    params: (b) => ({ id: b.incident }),
    body: () => ({ note: 'isolation check' }),
  },
  'POST /incidents/:id/status': {
    params: (b) => ({ id: b.incident }),
    body: () => ({ status: 'RESOLVED' }),
  },

  'POST /lost-person': {
    body: (b) => ({
      ...capture(),
      descriptionText: 'isolation check',
      lastSeenStationId: b.station,
    }),
  },
  'GET /lost-person/active': LIST,
  'POST /lost-person/:id/ack': { params: (b) => ({ id: b.alert }) },
  'POST /lost-person/:id/resolve': {
    params: (b) => ({ id: b.alert }),
    body: () => ({ outcome: 'RESOLVED_FOUND' }),
  },

  'GET /roster/me': ACTOR,
  'GET /roster/station/:stationId': { params: (b) => ({ stationId: b.station }) },
  'POST /roster/volunteers': noId('creates a person in the path event from names and emails'),
  'POST /roster/import': noId('rows name stations by code, resolved in the path event'),
  'POST /roster/swaps': {
    body: (b) => ({ assignmentId: b.assignment, targetVolunteerId: b.person }),
  },
  'GET /roster/swaps': ACTOR,
  'GET /roster/swaps/pending': LIST,
  'POST /roster/swaps/:id/decide': {
    params: (b) => ({ id: b.swap }),
    body: () => ({ decision: 'APPROVED' }),
  },
  'GET /roster/briefing-slots': { query: (b) => ({ eventDayId: b.day }) },
  'POST /roster/briefing-slots/:id/complete': { params: (b) => ({ id: b.slot }), body: () => ({}) },
  'GET /roster/gaps': LIST,

  'POST /cards/batch': noId('mints new cards in the path event'),
  'GET /cards/funnel': LIST,
  'GET /cards/qr/:payload': { params: (b) => ({ payload: b.card.qrPayload }) },
  'GET /cards/:shortCode': { params: (b) => ({ shortCode: b.card.shortCode }) },
  'POST /cards/:shortCode/issue': {
    params: (b) => ({ shortCode: b.card.shortCode }),
    body: () => capture(),
  },
  'POST /cards/:shortCode/stamps': {
    params: (b) => ({ shortCode: b.card.shortCode }),
    body: (b) => ({ ...capture(), stationId: b.station }),
  },
  'POST /cards/:shortCode/void': {
    params: (b) => ({ shortCode: b.card.shortCode }),
    body: () => ({ reason: 'isolation check' }),
  },
  'POST /cards/:shortCode/reissue': {
    params: (b) => ({ shortCode: b.card.shortCode }),
    body: () => ({ reason: 'isolation check', replacementShortCode: 'CCCC33' }),
  },

  'GET /gifts': LIST,
  'POST /gifts/redemptions': {
    body: (b) => ({ ...capture(), giftTypeId: b.giftType, stationId: b.station }),
  },
  'POST /gifts/:id/adjust': {
    params: (b) => ({ id: b.giftType }),
    body: () => ({ delta: 1, reason: 'isolation check' }),
  },
  'GET /gifts/summary': LIST,

  'POST /announcements': {
    body: (b) => ({ body: 'isolation check', target: { stationId: b.station } }),
  },
  'GET /announcements': LIST,
  'POST /announcements/:id/ack': { params: (b) => ({ id: b.announcement }) },
  'POST /announcements/drafts': {
    body: (b) => ({ ...capture(), body: 'isolation check', target: { stationId: b.station } }),
  },
  'GET /announcements/drafts': { query: (b) => ({ cursor: b.announcementDraft }) },
  'GET /announcements/drafts/:id': { params: (b) => ({ id: b.announcementDraft }) },
  'PUT /announcements/drafts/:id': {
    params: (b) => ({ id: b.announcementDraft }),
    body: () => ({ body: 'isolation check', expectedVersion: 1 }),
  },
  'POST /announcements/drafts/:id/schedules': {
    params: (b) => ({ id: b.announcementDraft }),
    body: () => ({
      ...capture(),
      expectedVersion: 1,
      runAt: new Date(FROZEN_NOW.getTime() + 60_000).toISOString(),
    }),
  },
  'GET /announcements/drafts/:id/schedules/:scheduleId': {
    params: (b) => ({ id: b.announcementDraft, scheduleId: b.announcementSchedule }),
  },
  'GET /announcements/drafts/:id/schedules': {
    params: (b) => ({ id: b.announcementDraft }),
  },
  'PUT /announcements/drafts/:id/schedules/:scheduleId': {
    params: (b) => ({ id: b.announcementDraft, scheduleId: b.announcementSchedule }),
    body: () => ({
      expectedVersion: 1,
      expectedDraftVersion: 1,
      runAt: new Date(FROZEN_NOW.getTime() + 120_000).toISOString(),
    }),
  },
  'POST /announcements/drafts/:id/schedules/:scheduleId/cancel': {
    params: (b) => ({ id: b.announcementDraft, scheduleId: b.announcementSchedule }),
    body: () => ({ expectedVersion: 1 }),
  },

  'GET /dashboard/live': LIST,
  'GET /dashboard/data-health': LIST,
  'GET /dashboard/station/:id': { params: (b) => ({ id: b.station }) },

  'POST /lost-found': { body: (b) => ({ itemLabel: 'isolation', foundStationId: b.station }) },
  'GET /lost-found': LIST,
  'POST /lost-found/:id/claim': { params: (b) => ({ id: b.found }), body: () => ({}) },
  'POST /lost-found/close-out': noId('closes out the path event'),

  'GET /reports/summary': LIST,
  'GET /reports/export': LIST,
  'GET /reports/snapshots': { query: (b) => ({ cursor: b.reportSnapshot }) },
  'GET /reports/snapshots/:id': { params: (b) => ({ id: b.reportSnapshot }) },
  'GET /reports/snapshots/:id/export': { params: (b) => ({ id: b.reportSnapshot }) },
  'GET /visitors': LIST,
  'GET /audit': LIST,

  'GET /admin/volunteers': LIST,
  'GET /admin/volunteers/:id': { params: (b) => ({ id: b.person }) },
  'PATCH /admin/volunteers/:id': {
    params: (b) => ({ id: b.person }),
    body: () => ({ displayName: 'Renamed' }),
  },
  'POST /admin/volunteers/:id/deactivate': {
    params: (b) => ({ id: b.person }),
    body: () => ({ reason: 'isolation check', disableIdentity: false }),
  },
  'POST /admin/volunteers/:id/reactivate': { params: (b) => ({ id: b.person }), body: () => ({}) },
  'POST /admin/assignments': {
    body: (b) => ({
      volunteerId: b.person,
      stationId: b.station,
      shiftId: b.shift,
    }),
  },
  'DELETE /admin/assignments/:id': { params: (b) => ({ id: b.assignment }) },
  'GET /admin/stations': LIST,
  'POST /admin/stations': noId('creates a station in the path event'),
  'PATCH /admin/stations/:id': { params: (b) => ({ id: b.station }), body: () => ({ name: 'X' }) },
  'GET /admin/event-days': LIST,
  'GET /admin/shift-templates': LIST,
  'PATCH /admin/shift-templates/:id': {
    params: (b) => ({ id: b.template }),
    body: () => ({ label: 'X' }),
  },
  'POST /admin/event-days': noId('creates a day in the path event'),
  'PATCH /admin/event-days/:id': { params: (b) => ({ id: b.day }), body: () => ({ label: 'X' }) },
  'POST /admin/gift-types': noId('creates a gift type in the path event'),
  'PATCH /admin/gift-types/:id': {
    params: (b) => ({ id: b.giftType }),
    body: () => ({ name: 'X' }),
  },
  'GET /admin/settings': noId('runtime settings are platform-wide until P10'),
  'GET /admin/settings/catalogue': noId(
    'reads the current manager’s scoped operational settings; foreign station, event and organisation layers are covered by scopedSettingsRead tests',
  ),
  'POST /admin/settings/catalogue': noId(
    'changes only current-manager operational keys in the path event; foreign stations, history scope and replay identity are covered by scopedSettingsMutation tests',
  ),
  'GET /admin/settings/catalogue/history': noId(
    'reads only the current manager’s exact path-event/scope/key history; foreign stations and event/key/scope cursors are covered by scopedSettingsHistory tests',
  ),
  'POST /admin/settings/catalogue/revert': noId(
    'restores only the current manager’s owned path-event/scope/key history; foreign selections and reviewed versions/replay identity are covered by scopedSettingsRevert tests',
  ),
  'POST /admin/settings/catalogue/schedules': noId(
    'creates only a reviewed capture schedule in the path event; foreign event/station/retry scope is covered by captureSchedule tests',
  ),
  'GET /admin/settings/catalogue/schedules/:id': {
    params: (b) => ({ id: b.announcementSchedule }),
  },
  'GET /admin/settings/catalogue/schedules': noId(
    'lists only exact path-event capture targets; foreign target/cursors are covered by captureScheduleManagement tests',
  ),
  'PATCH /admin/settings/catalogue/schedules/:id': {
    params: (b) => ({ id: b.announcementSchedule }),
    body: () => ({
      expectedScheduleVersion: 1,
      expectedVersion: 0,
      value: false,
      runAt: '2027-01-07T05:00:00Z',
      reason: 'Reviewed edit',
      idempotencyKey: idempotencyKey(),
    }),
  },
  'POST /admin/settings/catalogue/schedules/:id/cancel': {
    params: (b) => ({ id: b.announcementSchedule }),
    body: () => ({
      expectedScheduleVersion: 1,
      reason: 'Reviewed cancellation',
      idempotencyKey: idempotencyKey(),
    }),
  },
  'PATCH /admin/settings': noId('runtime settings are platform-wide until P10'),
  'GET /admin/event-settings': noId("reads the path event's settings"),
  'GET /admin/event-settings/history': noId(
    'reads only the current manager’s path-event/key history; explicit foreign event/key/scope cursors are covered by eventSettingHistory tests',
  ),
  'PATCH /admin/event-settings': noId("changes the path event's settings"),
  'POST /admin/event-settings/revert': noId(
    'restores a guarded product setting in the path event; foreign history targets and replay identity are covered by eventSettingRevert tests',
  ),
  'GET /admin/attendance-settings': noId("reads the path event's attendance setup"),
  'PATCH /admin/attendance-settings': noId(
    'changes path event settings; root membership scope is checked by settingStore tests',
  ),
  'POST /admin/attendance-settings/test-network': noId(
    'tests the request IP against supplied ranges without reading another event',
  ),
  'GET /admin/visitor-fields': LIST,
  'POST /admin/visitor-fields': noId('creates a field in the path event'),
  'PATCH /admin/visitor-fields/:id': {
    params: (b) => ({ id: b.visitorField }),
    body: () => ({ label: 'Foreign field' }),
  },

  'GET /notifications/config': noId('push configuration is platform-wide'),
  'POST /notifications/subscriptions': noId("registers the caller's own device"),
  'DELETE /notifications/subscriptions': noId("removes the caller's own device"),

  'GET /media/config': noId('upload configuration is platform-wide'),
  'POST /media/uploads': noId('uses a validated client retry UUID, never a supplied object key'),
  'GET /media/url': noId(
    'signs only a key with a successful upload receipt in the path event; foreign keys are covered by mediaEventOwnership tests',
  ),

  'POST /fallback/windows': {
    body: (b) => ({ tier: 3, reason: 'isolation check', stationId: b.station }),
  },
  'POST /fallback/windows/:id/close': { params: (b) => ({ id: b.window }), body: () => ({}) },
  'GET /fallback/windows': LIST,
  'POST /fallback/imports/registrations': {
    body: (b) => ({
      source: 'FALLBACK_SHEET',
      fallbackWindowId: b.window,
      rows: [
        {
          stationCode: 'A-DESK',
          category: 'SEC_1',
          count: 1,
          recordedAt: FROZEN_NOW.toISOString(),
        },
      ],
    }),
  },
  'POST /fallback/imports/footfall': {
    body: (b) => ({
      source: 'FALLBACK_SHEET',
      fallbackWindowId: b.window,
      rows: [{ stationCode: 'A-DESK', quantity: 1, timeBlockStart: FROZEN_NOW.toISOString() }],
    }),
  },
};

// ── The suite ───────────────────────────────────────────────────────────────

let app: Express;
let admin: TestVolunteer;
let eventA: EventScope;
let b: EventB;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  eventA = await testEvent();
  const dayId = (await createEventDayToday()).id;
  const stationId = (await createStation({ code: 'A-DESK' })).id;
  admin = await createVolunteer({ email: 'admin@isolation.test', role: 'ADMIN' });
  await assignToStationAllBlocks({ volunteerId: admin.id, stationId, eventDayId: dayId });
  b = await seedEventB();
});

function fill(template: string, params: Record<string, string>): string {
  return template.replace(/:(\w+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`no value for :${name} in ${template}`);
    return encodeURIComponent(value);
  });
}

/** Event B with every id replaced by one that exists nowhere. */
function ghostOf(real: EventB): EventB {
  const replace = (value: unknown): unknown =>
    typeof value === 'string'
      ? 'no-such-row'
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, replace(inner)]))
        : value;
  return replace(real) as EventB;
}

/** Bodies equal apart from computation time and per-request correlation ids. */
function sameBody(left: unknown, right: unknown): boolean {
  const strip = (body: unknown) =>
    JSON.stringify(body).replace(/"(serverTime|asOf|generatedAt|requestId)":"[^"]*"/g, '"$1":""');
  return strip(left) === strip(right);
}

function send(method: string, path: string, body?: object) {
  const call =
    request(app)[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](path);
  const authed = call.set('Authorization', bearer(admin));
  return body ? authed.send(body) : authed;
}

describe('cross-event isolation (P09.7)', () => {
  it('has a case for every route in the inventory, and none for a route that is gone', () => {
    const routes = inventory();
    expect(routes.filter((route) => !(route in CASES))).toEqual([]);
    expect(Object.keys(CASES).filter((route) => !routes.includes(route))).toEqual([]);
  });

  it("answers a foreign id as a missing one under the caller's own event: 404, or an empty filter", async () => {
    const ghost = ghostOf(b);
    const leaks: string[] = [];
    for (const [route, testCase] of Object.entries(CASES)) {
      if ('noId' in testCase) continue;
      const call = (ids: EventB) => {
        const [method = 'GET', template = ''] = route.split(' ');
        const path = fill(template, testCase.params?.(ids) ?? {});
        const query = new URLSearchParams(testCase.query?.(ids) ?? {}).toString();
        const url = `/api/v1/events/${eventA.eventId}${path}${query ? `?${query}` : ''}`;
        return send(method, url, testCase.body?.(ids));
      };
      const response = await call(b);
      if (testCase.query) {
        const missing = await call(ghost);
        if (response.status !== missing.status || !sameBody(response.body, missing.body)) {
          leaks.push(
            `${route} → ${response.status} ${JSON.stringify(response.body).slice(0, 160)}`,
          );
        }
      } else if (response.status !== 404) {
        leaks.push(`${route} → ${response.status} ${JSON.stringify(response.body).slice(0, 160)}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('answers 404 for every route under an event the caller is not a member of', async () => {
    const answered: string[] = [];
    for (const route of inventory()) {
      const [method = 'GET', template = ''] = route.split(' ');
      const path = template.replace(/:(\w+)/g, 'x');
      const response = await send(method, `/api/v1/events/${b.scope.eventId}${path}`, {});
      if (response.status !== 404) answered.push(`${route} → ${response.status}`);
    }
    expect(answered).toEqual([]);
  });

  it('answers 404 for an event that does not exist, or an id that cannot be one', async () => {
    expect((await send('GET', '/api/v1/events/no-such-event/stations')).status).toBe(404);
    expect((await send('GET', '/api/v1/events/bad%20id!/stations')).status).toBe(404);
  });

  it('asks for a token before saying anything about an event', async () => {
    const response = await request(app).get(`/api/v1/events/${b.scope.eventId}/stations`);
    expect(response.status).toBe(401);
  });
});

describe('the pre-P09.7 paths (ADR-009 §6)', () => {
  it("answer exactly as Event #1's paths do", async () => {
    for (const path of ['/stations', '/me', '/footfall/live', '/admin/event-days']) {
      const alias = await send('GET', `/api/v1${path}`);
      const scoped = await send('GET', `/api/v1/events/${eventA.eventId}${path}`);
      expect(alias.status, path).toBe(200);
      expect(scoped.status, path).toBe(200);
      expect(sameBody(alias.body, scoped.body), path).toBe(true);
    }
  });

  it('record a queued capture in Event #1, with its idempotency key, whichever path it took', async () => {
    const stationId = (await rawDb.station.findFirstOrThrow({ where: { code: 'A-DESK' } })).id;
    const key = idempotencyKey();
    const body = { idempotencyKey: key, category: 'SEC_2', stationId };

    const viaAlias = await send('POST', '/api/v1/registrations', body);
    const replayed = await send('POST', `/api/v1/events/${eventA.eventId}/registrations`, body);

    expect(viaAlias.status).toBe(201);
    expect(replayed.status).toBe(201);
    expect(replayed.body.registration.id).toBe(viaAlias.body.registration.id);
    const rows = await rawDb.registration.findMany({ where: { idempotencyKey: key } });
    expect(rows.map((row) => row.eventId)).toEqual([eventA.eventId]);
  });
});

describe('two events, one person', () => {
  it('works in each event under its own path, with its own role', async () => {
    await rawDb.eventMembership.create({
      data: { eventId: b.scope.eventId, personId: admin.id, role: 'VOLUNTEER' },
    });
    const inA = await send('GET', `/api/v1/events/${eventA.eventId}/me`);
    const inB = await send('GET', `/api/v1/events/${b.scope.eventId}/me`);
    expect(inA.body.volunteer.role).toBe('ADMIN');
    expect(inB.body.volunteer.role).toBe('VOLUNTEER');
    expect(inA.body.event.id).toBe(eventA.eventId);
    expect(inB.body.event.id).toBe(b.scope.eventId);
    expect(inB.body.upcomingAssignments).toEqual([]);

    const stations = await send('GET', `/api/v1/events/${b.scope.eventId}/stations`);
    expect(stations.body.data.map((station: { code: string }) => station.code)).toEqual(['B-DESK']);
  });

  it('opens a session for someone whose only event is the second one, in that event', async () => {
    const opened = await request(app)
      .post('/api/v1/auth/session')
      .send({ email: 'b-one@isolation.test' });
    expect(opened.status).toBe(201);
    expect(opened.body.volunteer.role).toBe('VOLUNTEER');

    const auth = `Bearer ${opened.body.accessToken as string}`;
    const inB = await request(app)
      .get(`/api/v1/events/${b.scope.eventId}/me`)
      .set('Authorization', auth);
    expect(inB.status).toBe(200);
    expect(inB.body.event.id).toBe(b.scope.eventId);
    // The alias paths are Event #1's, where this person has no membership.
    const alias = await request(app).get('/api/v1/me').set('Authorization', auth);
    expect(alias.status).toBe(403);
  });

  it('lists each person their own events, marking the one the old paths serve', async () => {
    await rawDb.eventMembership.create({
      data: { eventId: b.scope.eventId, personId: admin.id, role: 'VOLUNTEER' },
    });
    const mine = await send('GET', '/api/v1/events');
    expect(mine.status).toBe(200);
    expect(
      mine.body.data.map((event: { slug: string; role: string; servesLegacyPaths: boolean }) => [
        event.slug,
        event.role,
        event.servesLegacyPaths,
      ]),
    ).toEqual([
      ['test-event', 'ADMIN', true],
      ['event-b', 'VOLUNTEER', false],
    ]);

    const opened = await request(app)
      .post('/api/v1/auth/session')
      .send({ email: 'b-one@isolation.test' });
    const onlyB = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${opened.body.accessToken as string}`);
    expect(onlyB.body.data.map((event: { slug: string }) => event.slug)).toEqual(['event-b']);

    expect((await request(app).get('/api/v1/events')).status).toBe(401);
  });
});
