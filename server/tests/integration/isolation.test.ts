import type { Express, Router } from 'express';
import request from 'supertest';
import { ROLE_IDS, type Role } from '@spoh/access-policies';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  makePlatformAdmin,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';
import { guideContent, insertContentPublicationFixture } from '../helpers/content.js';
import { presignRead } from '../../src/modules/media/application/s3.js';
import { eventIdInputInventory } from '../helpers/idInputInventory.js';

// Only external object transport/configuration is replaced; receipt and event authority stay real.
vi.mock('../../src/modules/media/application/s3.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/modules/media/application/s3.js')>(),
  assertConfigured: () => undefined,
  presignRead: vi.fn(() => { throw new Error('Foreign media must never reach signing.'); }),
}));

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
  group: string;
  category: string;
  tick: string;
  incident: string;
  alert: string;
  found: string;
  card: { shortCode: string; qrPayload: string };
  replacementCard: string;
  giftType: string;
  redemption: string;
  importBatch: string;
  announcement: string;
  announcementDraft: string;
  announcementSchedule: string;
  swap: string;
  slot: string;
  window: string;
  visitorField: string;
  reportSnapshot: string;
  contentVersion: string;
  contentImageKey: string;
  archiveExport: string;
  cardPrintExport: string;
  stationType: string;
  stationTag: string;
  history: string;
  mediaKey: string;
  membership: string;
  brandingReceipt: string;
  cardId: string;
  audit: string;
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

async function seedEventB(input?: { scope: EventScope; tag: string }): Promise<EventB> {
  const scope = input?.scope ?? await createEventB();
  const tag = input?.tag ?? 'b';
  const { eventId } = scope;
  const person = await personIn(scope, `${tag}-one@isolation.test`);
  const other = await personIn(scope, `${tag}-two@isolation.test`);
  const type = await rawDb.stationType.create({ data: { eventId, code: `${tag.toUpperCase()}-BOUNDARY`,
    label: 'Boundary desk', registersVisitors: true, redeemsGifts: true, countsEntry: true, issuesStamp: true } });
  const station = await rawDb.station.create({
    data: { eventId, typeId: type.id, code: tag === 'b' ? 'B-DESK' : 'A-BOUNDARY', name: `${tag} boundary desk` },
  });
  const stationTag = await rawDb.stationTag.create({
    data: { eventId, code: 'B-TAG', label: 'B tag' },
  });
  const cardPrintExport = await rawDb.cardPrintExport.create({
    data: {
      id: `${tag}-card-print-export`,
      eventId,
      objectKey: `card-print/${eventId}/foreign.pdf`,
      format: 'pdf',
      count: 1,
      rehearsal: false,
      createdAt: FROZEN_NOW,
    },
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
    data: { ...common, categoryId: category.id, groupId: `${tag}-registration-group`, idempotencyKey: idempotencyKey() },
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
    data: { eventId, shortCode: tag === 'b' ? 'BBBB22' : 'AAAA22', qrPayload: `isolation-${tag}-card`, status: 'ISSUED' },
  });
  const replacement = await rawDb.missionCard.create({ data: { eventId,
    shortCode: tag === 'b' ? 'CCCC33' : 'DDDD33', qrPayload: `isolation-${tag}-replacement` } });
  const giftType = await rawDb.giftType.create({
    data: { eventId, name: 'B tote', initialStock: 10 },
  });
  const redemption = await rawDb.giftRedemption.create({ data: { ...common, giftTypeId: giftType.id, idempotencyKey: idempotencyKey() } });
  const importBatch = await rawDb.importBatch.create({ data: { eventId, targetTable: 'Registration',
    importedById: person, source: 'PAPER', rowCount: 0, provenanceVersion: 1 } });
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
  const contentVersion = await insertContentPublicationFixture({
    db: rawDb,
    eventId,
    personId: person,
    now: FROZEN_NOW,
  });
  const history = await rawDb.settingChange.create({ data: {
    scope: 'EVENT', scopeId: eventId, eventId, key: 'product.countsMode', version: 1,
    before: { mode: 'separate' }, after: { mode: 'separate' }, source: 'USER', actorPersonId: person,
  } });
  const mediaAudit = await rawDb.auditLog.create({ data: { eventId, actorId: person, actorSub: `local:b-one@isolation.test`,
    membershipId: membership.id, action: 'media.upload', entityType: 'MediaObject',
    entityId: `lost-found/${eventId}/foreign.jpg`, after: { purpose: 'lostFound', contentType: 'image/jpeg', rehearsal: false } } });
  const brandingReceipt = await rawDb.contentUploadReceipt.create({ data: {
    id: idempotencyKey(), eventId, key: `drafts/${eventId}/branding/foreign-upload`,
    contentType: 'image/png', contentLength: 1000, issuedByPersonId: person, createdAt: FROZEN_NOW,
  } });
  const contentImage = await rawDb.contentUploadReceipt.create({ data: {
    id: idempotencyKey(), eventId, key: `drafts/${eventId}/${idempotencyKey()}`,
    contentType: 'image/png', contentLength: 1000, issuedByPersonId: person, createdAt: FROZEN_NOW,
  } });
  const archiveExport = await rawDb.archiveExport.create({
    data: {
      id: `${tag}-archive-export`,
      eventId,
      snapshotId: reportSnapshot.id,
      lifecycleVersion: 0,
      objectKey: `archive/${eventId}/foreign.xlsx`,
      createdAt: FROZEN_NOW,
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
    group: registration.groupId!,
    category: category.id,
    tick: tick.id,
    incident: incident.id,
    alert: alert.id,
    found: found.id,
    card: { shortCode: card.shortCode, qrPayload: card.qrPayload },
    replacementCard: replacement.shortCode,
    giftType: giftType.id,
    redemption: redemption.id,
    importBatch: importBatch.id,
    announcement: announcement.id,
    announcementDraft: announcementDraft.id,
    announcementSchedule: announcementSchedule.id,
    swap: swap.id,
    slot: slot.id,
    window: window.id,
    visitorField: visitorField.id,
    reportSnapshot: reportSnapshot.id,
    contentVersion: contentVersion.id,
    contentImageKey: contentImage.key,
    archiveExport: archiveExport.id,
    cardPrintExport: cardPrintExport.id,
    stationType: type.id,
    stationTag: stationTag.id,
    history: history.id,
    mediaKey: `lost-found/${eventId}/foreign.jpg`,
    membership: membership.id,
    brandingReceipt: brandingReceipt.id,
    cardId: card.id,
    audit: mediaAudit.id,
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
  'GET /workspace/entity': { query: (b) => ({ kind: 'person', id: b.person, via: 'assignment', assignmentId: b.assignment }) },
  'GET /workspace/records': { query: (b) => ({ kind: 'footfall', cursor: b.tick }) },
  'GET /workspace/search': noId('each source searches only the path event under current authority'),
  'GET /branding': LIST,
  'GET /branding/draft/assets/:variant': noId('variant is a fixed enum; asset registry resolves only the path event'),
  'PUT /branding/draft': { body: (b) => ({ ...capture(), expectedVersion: 0,
    body: { accent: '#112233', logoAlt: 'Synthetic boundary logo', uploadReceiptId: b.brandingReceipt } }) },
  'POST /branding/publish': noId('publishes only the path event draft under its expected version'),
  'POST /branding/images/upload': noId('allocates a server-generated key under the path event namespace'),
  'POST /gifts/redemptions/:id/void': { params: (b) => ({ id: b.redemption }), body: () => ({ ...capture(), reason: 'Reviewed correction' }) },
  'POST /fallback/imports/:id/undo': { params: (b) => ({ id: b.importBatch }), body: () => ({ ...capture(), reason: 'Reviewed import correction' }) },
  'POST /fallback/salvage/confirm': { query: () => ({}), body: (b) => ({ ...capture(), reason: 'Reviewed retained capture',
    entries: [{ ...capture(), captureKind: 'registration', recordId: b.registration }] }) },
  'GET /admin/structure': LIST,
  'GET /gifts/catalogue': LIST,
  'POST /admin/structure/types': noId('creates a station type in the path event'),
  'POST /admin/structure/tags': noId('creates a station tag in the path event'),
  'POST /admin/structure/categories': noId('creates a category in the path event'),
  'POST /admin/structure/templates': noId('creates a template in the path event'),
  'PATCH /admin/structure/types/:id': {
    params: (b) => ({ id: b.stationType }),
    body: () => ({ idempotencyKey: idempotencyKey(), label: 'Foreign type' }),
  },
  'PATCH /admin/structure/tags/:id': {
    params: (b) => ({ id: b.stationTag }),
    body: () => ({ idempotencyKey: idempotencyKey(), label: 'Foreign tag' }),
  },
  'PATCH /admin/structure/categories/:id': {
    params: (b) => ({ id: b.category }),
    body: () => ({ idempotencyKey: idempotencyKey(), label: 'Foreign category' }),
  },
  'PATCH /admin/structure/templates/:id': {
    params: (b) => ({ id: b.template }),
    body: () => ({ idempotencyKey: idempotencyKey(), label: 'Foreign template' }),
  },
  'PATCH /admin/structure/shifts/:id': {
    params: (b) => ({ id: b.shift }),
    body: () => ({ idempotencyKey: idempotencyKey(), operation: 'restore' }),
  },
  'DELETE /admin/structure/days/:id': {
    params: (b) => ({ id: b.day }),
    body: () => ({ idempotencyKey: idempotencyKey() }),
  },
  'POST /cards/print': {
    body: (b) => ({
      idempotencyKey: idempotencyKey(),
      shortCodes: [b.card.shortCode],
      format: 'pdf',
    }),
  },
  'GET /cards/print': { query: (b) => ({ cursor: b.cardPrintExport }) },
  'GET /cards/print/:id': { params: (b) => ({ id: b.cardPrintExport }) },
  'GET /cards/print/:id/details': { params: (b) => ({ id: b.cardPrintExport }) },
  'POST /gifts/:id/stock': {
    params: (b) => ({ id: b.giftType }),
    body: () => ({ delta: 1, reason: 'Isolation test', idempotencyKey: idempotencyKey() }),
  },
  'GET /roster/swap-targets': LIST,
  'POST /roster/briefing-slots': {
    body: (b) => ({
      eventDayId: b.day,
      briefierId: b.person,
      startsAt: FROZEN_NOW.toISOString(),
      waveSize: 20,
      idempotencyKey: idempotencyKey(),
    }),
  },
  'GET /content': { query: (b) => ({ v: b.contentVersion }) },
  'GET /content/draft': LIST,
  'GET /content/versions': LIST,
  'PUT /content/draft': {
    body: (b) => ({
      idempotencyKey: idempotencyKey(),
      expectedVersion: 0,
      body: {
        ...guideContent(),
        brief: { ...guideContent().brief, programmes: [{ stationTagId: b.stationTag, oneLiner: 'A programme', faqs: [] }] },
        journey: { steps: [{ title: 'Visit', detail: 'Visit the desk', stationIds: [b.station] }] },
        map: { intro: 'Find the desk', levels: [{ label: 'Ground', image: { mediaKey: b.contentImageKey, alt: 'Floor plan' },
          points: [{ label: 'Desk', kind: 'station', stationId: b.station }] }] },
      },
    }),
  },
  'POST /content/review': noId('reviews the current draft version in the path event'),
  'POST /content/publish': noId('publishes the current reviewed draft version in the path event'),
  'POST /content/schedules': noId('schedules publication of the path event current draft version'),
  'POST /content/images/upload': noId('creates a generated image receipt within the path event'),
  'GET /content/assets/:versionId/:image': {
    params: (b) => ({ versionId: b.contentVersion, image: 'map-0' }),
  },
  'GET /lifecycle': LIST,
  'GET /lifecycle/readiness': LIST,
  'GET /schedules': { query: (b) => ({ cursor: b.announcementSchedule }) },
  'POST /schedules/lifecycle': noId(
    'schedules a transition of the path event only, reviewed against its own lifecycle version',
  ),
  'POST /schedules/reports': {
    body: (b) => ({
      eventDayId: b.day,
      runAt: '2027-01-07T05:00:00Z',
      idempotencyKey: idempotencyKey(),
    }),
  },
  'POST /schedules/:id/cancel': {
    params: (b) => ({ id: b.announcementSchedule }),
    body: () => ({ expectedVersion: 1, idempotencyKey: idempotencyKey() }),
  },
  'POST /lifecycle': noId(
    'transitions only the event named in the path; no body event id is accepted',
  ),
  'GET /me': ACTOR,
  'GET /me/permissions': ACTOR,
  'GET /permissions': LIST,
  'POST /permissions/review': noId(
    'reviews the current grants in the path event; the body names only its reviewed version',
  ),
  'PUT /permissions': noId(
    "changes a role's grant in the path event; the body names a role and an action, not a row",
  ),
  'POST /permissions/simulate': {
    body: (b) => ({ personId: b.person, action: 'Self.Read', resource: { type: 'Station', id: b.station } }),
  },
  'GET /permissions/people/:personId': { params: (b) => ({ personId: b.person }) },
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
  'GET /registrations/summary': { query: (b) => ({ stationId: b.station, eventDayId: b.day }) },
  'GET /registrations/categories': LIST,
  'GET /registrations/recent': { query: (b) => ({ stationId: b.station, cursor: b.registration }) },

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
  'GET /footfall/summary': { query: (b) => ({ stationId: b.station, eventDayId: b.day }) },
  'GET /footfall/live': LIST,
  'GET /footfall/recent': { query: (b) => ({ stationId: b.station, cursor: b.tick }) },

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
  'GET /incidents': { query: (b) => ({ stationId: b.station, cursor: b.incident }) },
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
  'GET /roster/station/:stationId': { params: (b) => ({ stationId: b.station }), query: (b) => ({ eventDayId: b.day }) },
  'POST /roster/volunteers': noId('creates a person in the path event from names and emails'),
  'POST /roster/import': noId('rows name stations by code, resolved in the path event'),
  'POST /roster/swaps': {
    body: (b) => ({ assignmentId: b.assignment, targetVolunteerId: b.person }),
  },
  'GET /roster/swaps': ACTOR,
  'GET /roster/swaps/pending': LIST,
  'POST /roster/swaps/:id/withdraw': {
    params: (b) => ({ id: b.swap }),
    body: () => ({ idempotencyKey: idempotencyKey() }),
  },
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
    body: (b) => ({ ...capture(), groupId: b.group }),
  },
  'POST /cards/:shortCode/stamps': {
    params: (b) => ({ shortCode: b.card.shortCode }),
    body: (b) => ({ ...capture(), stationId: b.station }),
  },
  'POST /cards/:shortCode/void': {
    params: (b) => ({ shortCode: b.card.shortCode }),
    body: () => ({ reason: 'isolation check', idempotencyKey: idempotencyKey() }),
  },
  'POST /cards/:shortCode/reissue': {
    params: (b) => ({ shortCode: b.card.shortCode }),
    body: (b) => ({ reason: 'isolation check', replacementShortCode: b.replacementCard, idempotencyKey: idempotencyKey() }),
  },

  'GET /gifts': LIST,
  'POST /gifts/redemptions': {
    body: (b) => ({ ...capture(), giftTypeId: b.giftType, stationId: b.station }),
  },
  'POST /gifts/:id/adjust': {
    params: (b) => ({ id: b.giftType }),
    body: () => ({ delta: 1, reason: 'isolation check' }),
  },
  'GET /gifts/summary': { query: (b) => ({ eventDayId: b.day, stationId: b.station }) },

  'POST /announcements': {
    body: (b) => ({ body: 'isolation check', target: { stationId: b.station, eventDayId: b.day } }),
  },
  'GET /announcements': { query: (b) => ({ cursor: b.announcement }) },
  'POST /announcements/:id/ack': { params: (b) => ({ id: b.announcement }) },
  'POST /announcements/drafts': {
    body: (b) => ({ ...capture(), body: 'isolation check', target: { stationId: b.station, eventDayId: b.day } }),
  },
  'GET /announcements/drafts': { query: (b) => ({ cursor: b.announcementDraft }) },
  'GET /announcements/drafts/:id': { params: (b) => ({ id: b.announcementDraft }) },
  'PUT /announcements/drafts/:id': {
    params: (b) => ({ id: b.announcementDraft }),
    body: (b) => ({ body: 'isolation check', expectedVersion: 1, target: { stationId: b.station, eventDayId: b.day } }),
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
    query: (b) => ({ cursor: b.announcementSchedule }),
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
  'GET /lost-found': { query: (b) => ({ cursor: b.found }) },
  'POST /lost-found/:id/claim': { params: (b) => ({ id: b.found }), body: () => ({}) },
  'POST /lost-found/close-out': noId('closes out the path event'),

  'GET /reports/summary': { query: (b) => ({ eventDayId: b.day }) },
  'GET /reports/export': { query: (b) => ({ eventDayId: b.day }) },
  'GET /reports/archive-exports': LIST,
  'POST /reports/archive-export': noId(
    'creates a private export from the path event current frozen final report',
  ),
  'GET /reports/archive-export/:id': { params: (b) => ({ id: b.archiveExport }) },
  'GET /reports/snapshots': { query: (b) => ({ cursor: b.reportSnapshot }) },
  'GET /reports/snapshots/:id': { params: (b) => ({ id: b.reportSnapshot }) },
  'GET /reports/snapshots/:id/export': { params: (b) => ({ id: b.reportSnapshot }) },
  'GET /visitors': LIST,
  'GET /audit': { query: (b) => ({ actorId: b.person, entityId: b.incident, cursor: b.audit }) },

  'GET /admin/volunteers': { query: (b) => ({ stationId: b.station, eventDayId: b.day, cursor: b.person }) },
  'GET /admin/volunteers/:id': { params: (b) => ({ id: b.person }) },
  'PATCH /admin/volunteers/:id': {
    params: (b) => ({ id: b.person }),
    body: (b) => ({ displayName: 'Renamed', reportsToId: b.person }),
  },
  'POST /admin/volunteers/:id/deactivate': {
    params: (b) => ({ id: b.person }),
    body: () => ({ reason: 'isolation check', disableIdentity: false }),
  },
  'POST /admin/volunteers/:id/reactivate': { params: (b) => ({ id: b.person }), body: () => ({}) },
  'POST /admin/volunteers/bulk': { body: (b) => ({ ids: [b.person], action: 'resend' }) },
  'POST /admin/volunteers/:id/resend-invite': {
    params: (b) => ({ id: b.person }),
    body: () => ({}),
  },
  'POST /admin/volunteers/:id/sign-out': { params: (b) => ({ id: b.person }), body: () => ({}) },
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
  'GET /admin/organisation-settings': noId(
    "reads the path event's organisation settings; other organisations are covered by organisationSettings tests",
  ),
  'PATCH /admin/event-name': noId(
    'renames the path event itself; authority, stale reads and archived events are covered by renameEvent tests',
  ),
  'PATCH /admin/organisation-settings': noId(
    "changes the path event's organisation settings; platform-admin authority is covered by organisationSettings tests",
  ),
  'GET /admin/settings/client': noId(
    "resolves the path event's device tuning; foreign event layers are covered by clientSettings tests",
  ),
  'GET /admin/capture-categories': { query: (b) => ({ cursor: b.category }) },
  'GET /admin/capture-categories/:categoryId': {
    params: (b) => ({ categoryId: b.category }),
  },
  'GET /admin/capture-categories/:categoryId/schedules': {
    params: (b) => ({ categoryId: b.category }),
    query: (b) => ({ cursor: b.announcementSchedule }),
  },
  'GET /admin/capture-categories/:categoryId/schedules/:id': {
    params: (b) => ({ categoryId: b.category, id: b.announcementSchedule }),
  },
  'POST /admin/capture-categories/:categoryId/schedules': {
    params: (b) => ({ categoryId: b.category }),
    body: () => ({
      ...capture(),
      active: false,
      expectedActive: true,
      expectedUpdatedAt: FROZEN_NOW.toISOString(),
      reason: 'isolation check',
      runAt: new Date(FROZEN_NOW.getTime() + 60_000).toISOString(),
    }),
  },
  'PATCH /admin/capture-categories/:categoryId/schedules/:id': {
    params: (b) => ({ categoryId: b.category, id: b.announcementSchedule }),
    body: () => ({
      ...capture(),
      active: false,
      expectedActive: true,
      expectedScheduleVersion: 1,
      expectedUpdatedAt: FROZEN_NOW.toISOString(),
      reason: 'isolation check',
      runAt: new Date(FROZEN_NOW.getTime() + 60_000).toISOString(),
    }),
  },
  'POST /admin/capture-categories/:categoryId/schedules/:id/cancel': {
    params: (b) => ({ categoryId: b.category, id: b.announcementSchedule }),
    body: () => ({ ...capture(), expectedScheduleVersion: 1, reason: 'isolation check' }),
  },
  'GET /admin/settings/catalogue': { query: (b) => ({ scope: 'station', stationId: b.station }) },
  'POST /admin/settings/catalogue': { body: (b) => ({ ...capture(),
    target: { scope: 'station', stationId: b.station }, key: 'capture.open',
    operation: 'set', value: false, expectedVersion: 0, reason: 'Isolation boundary' }) },
  'GET /admin/settings/catalogue/history': { query: (b) => ({ scope: 'station', stationId: b.station,
    key: 'capture.open', cursor: b.history }) },
  'POST /admin/settings/catalogue/revert': { body: (b) => ({ ...capture(),
    target: { scope: 'station', stationId: b.station }, key: 'capture.open',
    historyId: b.history, expectedVersion: 0, reason: 'Isolation boundary' }) },
  'POST /admin/settings/catalogue/schedules': { body: (b) => ({ ...capture(),
    target: { scope: 'station', stationId: b.station }, key: 'capture.open', value: false,
    expectedVersion: 0, reason: 'Isolation boundary', runAt: '2027-01-07T05:00:00Z' }) },
  'GET /admin/settings/catalogue/schedules/:id': {
    params: (b) => ({ id: b.announcementSchedule }),
  },
  'GET /admin/settings/catalogue/schedules': { query: (b) => ({ scope: 'station', stationId: b.station,
    cursor: b.announcementSchedule }) },
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
  'GET /admin/event-settings': noId("reads the path event's settings"),
  'GET /admin/event-settings/history': { query: (b) => ({ key: 'product.countsMode', cursor: b.history }) },
  'PATCH /admin/event-settings': { body: (b) => ({ key: 'product.countsMode', expectedVersion: 0,
    value: { mode: 'headline', source: { count: 'footfall', stationId: b.station } }, reason: 'Isolation check' }) },
  'POST /admin/event-settings/revert': { body: (b) => ({ ...capture(), key: 'product.countsMode',
    historyId: b.history, expectedVersion: 0, reason: 'Isolation boundary' }) },
  'GET /admin/attendance-settings': noId("reads the path event's attendance setup"),
  'PATCH /admin/attendance-settings': { body: (b) => ({ key: 'attendance.rootMembershipId',
    value: b.membership, expectedVersion: 0 }) },
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
  'GET /media/url': { query: (b) => ({ key: b.mediaKey }) },

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
  vi.clearAllMocks();
  await resetDatabase();
  eventA = await testEvent();
  const { organisationId } = await rawDb.event.findUniqueOrThrow({ where: { id: eventA.eventId } });
  // This campaign exercises authority rather than filling an unrelated fixed-window quota.
  await rawDb.setting.createMany({ data: ['rateLimit.max.admin', 'rateLimit.max.default'].map((key) => ({
    scope: 'PLATFORM', scopeId: organisationId, key, value: 10000, version: 1 })) });
  const dayId = (await createEventDayToday()).id;
  const stationId = (await createStation({ code: 'A-DESK' })).id;
  admin = await createVolunteer({ email: 'admin@isolation.test', role: 'ADMIN' });
  await makePlatformAdmin(admin.id);
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
  const ghost = replace(real) as EventB;
  // Keep the missing target schema-valid, so validation is never isolation proof.
  ghost.card = { shortCode: 'ZZZZ22', qrPayload: 'isolation-missing-card' };
  ghost.replacementCard = 'ZZZZ33';
  ghost.brandingReceipt = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ghost.mediaKey = `lost-found/${real.scope.eventId}/missing.jpg`;
  ghost.contentImageKey = `drafts/${real.scope.eventId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
  return ghost;
}

/** Bodies equal apart from computation time and per-request correlation ids. */
function sameBody(left: unknown, right: unknown): boolean {
  const strip = (body: unknown) =>
    JSON.stringify(body).replace(/"(serverTime|asOf|generatedAt|requestId)":"[^"]*"/g, '"$1":""');
  return strip(left) === strip(right);
}

/** This queue confirmation deliberately refuses with CONFLICT, keeping unproved captures locally. */
function targetStatuses(route: string, testCase: IdCase) {
  return route === 'POST /fallback/salvage/confirm' ? [409]
    : testCase.query ? [200, 403, 404] : [403, 404];
}

function send(method: string, path: string, body?: object, actor = admin) {
  const call =
    request(app)[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](path);
  const authed = call.set('Authorization', bearer(actor));
  return body ? authed.send(body) : authed;
}

type InputLocation = 'params' | 'query' | 'body';
interface IdInput { location: InputLocation; path: string[]; foreign: string; missing: string }
function stringLeaves(value: unknown, path: string[] = []): Array<{ path: string[]; value: string }> {
  if (typeof value === 'string') return [{ path, value }];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, inner]) => stringLeaves(inner, [...path, key]));
}
function atPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value);
}
/** Discover every fixture-backed path/body/query ID separately, including nested fields and arrays. */
function idInputs(testCase: IdCase, foreign: EventB): IdInput[] {
  const targets = new Set(stringLeaves(foreign).map((row) => row.value));
  const missing = ghostOf(foreign);
  return (['params', 'query', 'body'] as const).flatMap((location) => {
    const actual = testCase[location]?.(foreign);
    const absent = testCase[location]?.(missing);
    return stringLeaves(actual).filter((leaf) => targets.has(leaf.value)).map((leaf) => ({
      location, path: leaf.path, foreign: leaf.value, missing: atPath(absent, leaf.path) as string,
    }));
  });
}
function changeInput(value: unknown, path: string[], replacement: string): unknown {
  if (!path.length) return replacement;
  const [key, ...rest] = path;
  const copy = structuredClone(value) as Record<string, unknown>;
  copy[key!] = changeInput(copy[key!], rest, replacement);
  return copy;
}
function singleTargetRequest(route: string, testCase: IdCase, own: EventB,
  input: IdInput, target: string, actor: TestVolunteer) {
  const parts: Record<InputLocation, unknown> = { params: testCase.params?.(own) ?? {},
    query: testCase.query?.(own) ?? {}, body: testCase.body?.(own) };
  parts[input.location] = changeInput(parts[input.location], input.path, target);
  // The independently seeded own event has a real version-1 publication/draft.
  if (route === 'PUT /content/draft') (parts.body as { expectedVersion: number }).expectedVersion = 1;
  const [method = 'GET', template = ''] = route.split(' ');
  const path = fill(template, parts.params as Record<string, string>);
  const query = new URLSearchParams(parts.query as Record<string, string>).toString();
  return send(method, `/api/v1/events/${eventA.eventId}${path}${query ? `?${query}` : ''}`,
    parts.body as object | undefined, actor);
}

describe('cross-event isolation (P09.7)', () => {
  it('has a case for every route in the inventory, and none for a route that is gone', () => {
    const routes = inventory();
    expect(routes.filter((route) => !(route in CASES))).toEqual([]);
    expect(Object.keys(CASES).filter((route) => !routes.includes(route))).toEqual([]);
  });

  it('has an independently varied fixture for each ID input declared by the mounted schemas', () => {
    const missing = eventIdInputInventory().filter(({ route, field }) => {
      const testCase = CASES[route];
      if (!testCase || 'noId' in testCase) return true;
      const inputs = idInputs(testCase, b).map((input) => `${input.location}.${input.path.join('.')}`.replace(/\.\d+(?=\.|$)/g, '.*'));
      return !inputs.includes(field);
    });
    expect(missing).toEqual([]);
  });

  it("answers a foreign id as a missing one under the caller's own event: 404, or an empty filter", async () => {
    const ghost = ghostOf(b);
    const leaks: string[] = [];
    for (const [route, testCase] of Object.entries(CASES)) {
      if ('noId' in testCase) continue;
      // Each route is a separate authority scenario; sensitive quota is proven by its own suites.
      await rawDb.rateLimitCounter.deleteMany({ where: { namespace: 'http.sensitive' } });
      // Day removal is deliberately unavailable in LIVE; exercise its id lookup in preparation.
      if (route === 'DELETE /admin/structure/days/:id')
        await rawDb.event.update({ where: { id: eventA.eventId }, data: { status: 'DRAFT' } });
      const call = (ids: EventB) => {
        const [method = 'GET', template = ''] = route.split(' ');
        const path = fill(template, testCase.params?.(ids) ?? {});
        const query = new URLSearchParams(testCase.query?.(ids) ?? {}).toString();
        const url = `/api/v1/events/${eventA.eventId}${path}${query ? `?${query}` : ''}`;
        return send(method, url, testCase.body?.(ids));
      };
      const response = await call(b);
      if (route === 'DELETE /admin/structure/days/:id')
        await rawDb.event.update({ where: { id: eventA.eventId }, data: { status: 'LIVE' } });
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

describe('P15 every id-taking event route × all roles', () => {
  const entityTargets = {
    station: 'station', person: 'person', 'event-day': 'day', shift: 'shift', card: 'cardId',
    incident: 'incident', 'lost-person': 'alert', 'lost-found': 'found', announcement: 'announcement',
    fallback: 'window', import: 'importBatch', assignment: 'assignment', registration: 'registration',
    footfall: 'tick', redemption: 'redemption', gift: 'giftType', audit: 'audit',
  } as const satisfies Record<string, keyof EventB>;
  const recordTargets = {
    registrations: { stationId: 'station', personId: 'person', categoryId: 'category', importBatchId: 'importBatch', cardId: 'cardId' },
    footfall: { stationId: 'station', personId: 'person', importBatchId: 'importBatch' },
    cards: { stationId: 'station' }, stamps: { stationId: 'station', personId: 'person', cardId: 'cardId' },
    redemptions: { stationId: 'station', personId: 'person', giftTypeId: 'giftType', cardId: 'cardId' },
    incidents: { stationId: 'station', personId: 'person' }, 'lost-person': { stationId: 'station', personId: 'person' },
    'lost-found': { stationId: 'station', personId: 'person' },
    announcements: { stationId: 'station', personId: 'person', eventDayId: 'day' },
    assignments: { stationId: 'station', personId: 'person', eventDayId: 'day', shiftId: 'shift' },
    imports: { personId: 'person', fallbackWindowId: 'window' }, fallback: { stationId: 'station' },
    'gift-ledger': { giftTypeId: 'giftType' }, audit: { personId: 'person' }, people: { personId: 'person' },
    days: { eventDayId: 'day' },
  } as const satisfies Record<string, Record<string, keyof EventB>>;

  it.each(ROLE_IDS)('isolates each distinct path/body/query target independently for %s', async (role: Role) => {
    const own = await seedEventB({ scope: eventA, tag: 'a' });
    const actor = await createVolunteer({ email: `${role.toLowerCase()}@p15-one-target.test`, role });
    const day = await createEventDayToday();
    const station = await createStation({ code: 'A-DESK' });
    await assignToStationAllBlocks({ volunteerId: actor.id, stationId: station.id, eventDayId: day.id });
    const tested: string[] = [];
    for (const [route, testCase] of Object.entries(CASES)) {
      if ('noId' in testCase) continue;
      await rawDb.rateLimitCounter.deleteMany({ where: { namespace: 'http.sensitive' } });
      const fields = idInputs(testCase, b);
      expect(fields.length, `No inventoried target for ${route}`).toBeGreaterThan(0);
      if (route === 'DELETE /admin/structure/days/:id')
        await rawDb.event.update({ where: { id: eventA.eventId }, data: { status: 'DRAFT' } });
      for (const field of fields) {
        const label = `${role} ${route} ${field.location}.${field.path.join('.')}`;
        const foreign = await singleTargetRequest(route, testCase, own, field, field.foreign, actor);
        const missing = await singleTargetRequest(route, testCase, own, field, field.missing, actor);
        expect(targetStatuses(route, testCase), label).toContain(foreign.status);
        if (route === 'POST /fallback/salvage/confirm') expect(foreign.body.error.code).toBe('CONFLICT');
        expect(missing.status, label).toBe(foreign.status);
        expect(sameBody(foreign.body, missing.body), label).toBe(true);
        tested.push(`${route} ${field.location}.${field.path.join('.')}`);
      }
      if (route === 'DELETE /admin/structure/days/:id')
        await rawDb.event.update({ where: { id: eventA.eventId }, data: { status: 'LIVE' } });
    }
    expect(tested.length).toBeGreaterThan(Object.values(CASES).filter((item) => !('noId' in item)).length);
    expect(new Set(tested).size).toBe(tested.length);
    expect(presignRead).not.toHaveBeenCalled();
  }, 300_000);

  it.each(ROLE_IDS)('isolates every workspace entity and each foreign record predicate for %s', async (role: Role) => {
    const actor = await createVolunteer({ email: `${role.toLowerCase()}@p15-workspace-isolation.test`, role });
    const missing = ghostOf(b);
    for (const [kind, target] of Object.entries(entityTargets)) {
      const call = (ids: EventB) => send('GET', `/api/v1/events/${eventA.eventId}/workspace/entity?${new URLSearchParams({
        kind, id: ids[target] as string,
      })}`, undefined, actor);
      const foreign = await call(b);
      const ghost = await call(missing);
      expect([403, 404], `${role} entity ${kind}`).toContain(foreign.status);
      expect(ghost.status, `${role} entity ${kind}`).toBe(foreign.status);
      expect(sameBody(foreign.body, ghost.body), `${role} entity ${kind}`).toBe(true);
    }
    for (const [kind, fields] of Object.entries(recordTargets)) {
      for (const [field, target] of Object.entries(fields)) {
        const call = (ids: EventB) => send('GET', `/api/v1/events/${eventA.eventId}/workspace/records?${new URLSearchParams({
          kind, [field]: ids[target] as string,
          ...(kind === 'cards' ? { stage: 'station' } : {}),
          ...(kind === 'gift-ledger' ? { rehearsal: 'false' } : {}),
        })}`, undefined, actor);
        const foreign = await call(b);
        const ghost = await call(missing);
        expect([200, 403, 404], `${role} ${kind}.${field}`).toContain(foreign.status);
        expect(ghost.status, `${role} ${kind}.${field}`).toBe(foreign.status);
        // The response echoes the supplied filter; verify it exactly before comparing all server output.
        const body = (response: typeof foreign, supplied: string) => {
          const copy = structuredClone(response.body);
          if (response.status === 200) {
            expect(copy.filter[field]).toBe(supplied);
            copy.filter[field] = '[supplied-filter]';
          }
          return copy;
        };
        expect(sameBody(body(foreign, b[target] as string), body(ghost, missing[target] as string)), `${role} ${kind}.${field}`).toBe(true);
        if (foreign.status === 200) expect(foreign.body.data, `${role} ${kind}.${field}`).toEqual([]);
      }
    }
  }, 120_000);

  it.each(ROLE_IDS)('keeps foreign targets and missing targets indistinguishable for %s', async (role: Role) => {
    const actor = await createVolunteer({ email: `${role.toLowerCase()}@p15-isolation.test`, role });
    const day = await createEventDayToday();
    const station = await createStation({ code: 'A-DESK' });
    await assignToStationAllBlocks({ volunteerId: actor.id, stationId: station.id, eventDayId: day.id });
    const ghost = ghostOf(b);
    const tried: string[] = [];
    for (const [route, testCase] of Object.entries(CASES)) {
      if ('noId' in testCase) continue;
      await rawDb.rateLimitCounter.deleteMany({ where: { namespace: 'http.sensitive' } });
      if (route === 'DELETE /admin/structure/days/:id')
        await rawDb.event.update({ where: { id: eventA.eventId }, data: { status: 'DRAFT' } });
      const call = (ids: EventB) => {
        const [method = 'GET', template = ''] = route.split(' ');
        const path = fill(template, testCase.params?.(ids) ?? {});
        const query = new URLSearchParams(testCase.query?.(ids) ?? {}).toString();
        return send(method, `/api/v1/events/${eventA.eventId}${path}${query ? `?${query}` : ''}`,
          testCase.body?.(ids), actor);
      };
      const foreign = await call(b);
      const missing = await call(ghost);
      const label = `${role} ${route}`;
      // A valid credential is essential: 401 or availability/validation failures prove nothing.
      expect(foreign.status, label).not.toBe(401);
      expect(missing.status, label).not.toBe(401);
      expect(foreign.status, label).toBe(missing.status);
      expect(sameBody(foreign.body, missing.body), label).toBe(true);
      expect(targetStatuses(route, testCase), label).toContain(foreign.status);
      if (route === 'POST /fallback/salvage/confirm') expect(foreign.body.error.code).toBe('CONFLICT');
      if (foreign.status === 200) {
        expect(JSON.stringify(foreign.body), label).not.toMatch(/B incident|B child|B umbrella|B private draft|B notice|b-one@isolation/);
      }
      if (route === 'DELETE /admin/structure/days/:id')
        await rawDb.event.update({ where: { id: eventA.eventId }, data: { status: 'LIVE' } });
      tried.push(route);
    }
    expect(tried.sort()).toEqual(Object.entries(CASES).filter(([, value]) => !('noId' in value)).map(([route]) => route).sort());
    expect(presignRead).not.toHaveBeenCalled();
    expect(await rawDb.person.findUniqueOrThrow({ where: { id: b.person } })).toMatchObject({ email: 'b-one@isolation.test' });
    expect(await rawDb.missionCard.findFirstOrThrow({ where: { eventId: b.scope.eventId, shortCode: b.card.shortCode } }))
      .toMatchObject({ status: 'ISSUED' });
  }, 120_000);

  it.each(ROLE_IDS)('refuses every route under a foreign event for %s', async (role: Role) => {
    const actor = await createVolunteer({ email: `${role.toLowerCase()}@p15-foreign-event.test`, role });
    for (const route of inventory()) {
      const [method = 'GET', template = ''] = route.split(' ');
      const testCase = CASES[route]!;
      const path = template.replace(/:(\w+)/g, 'missing-row');
      const response = await send(method, `/api/v1/events/${b.scope.eventId}${path}`,
        'noId' in testCase ? {} : testCase.body?.(b), actor);
      expect(response.status, `${role} ${route}`).toBe(404);
    }
  }, 120_000);
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
      .post('/api/v1/auth/session').set('Origin', 'http://localhost:3000')
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
      .post('/api/v1/auth/session').set('Origin', 'http://localhost:3000')
      .send({ email: 'b-one@isolation.test' });
    const onlyB = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${opened.body.accessToken as string}`);
    expect(onlyB.body.data.map((event: { slug: string }) => event.slug)).toEqual(['event-b']);

    expect((await request(app).get('/api/v1/events')).status).toBe(401);
  });
});
