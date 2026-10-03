import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { AnnouncementDraftRecord, CreateAnnouncementDraftRequest } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import * as notification from '../../src/modules/notification/index.js';
import * as draftRepo from '../../src/modules/announcement/data/draftRepo.js';
import { createDraft } from '../../src/modules/announcement/application/createDraft.js';
import { reserve } from '../../src/platform/idempotency/index.js';
import * as replay from '../../src/platform/idempotency/index.js';
import * as audit from '../../src/platform/audit/index.js';
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

const app = createApp();
let eventId: string;
let author: TestVolunteer;
let membershipId: string;
let number = 0;
const base = () => `/api/v1/events/${eventId}/announcements`;
const content = { body: 'Private draft text', priority: 'URGENT', requiresAck: true, target: {} };
const create = (data = {}, actor = author) =>
  request(app)
    .post(`${base()}/drafts`)
    .set('Authorization', bearer(actor))
    .send({ ...content, idempotencyKey: idempotencyKey(), ...data });
const update = (id: string, data = {}, actor = author) =>
  request(app)
    .put(`${base()}/drafts/${id}`)
    .set('Authorization', bearer(actor))
    .send({ ...content, expectedVersion: 1, ...data });
const read = (id: string, actor = author) =>
  request(app).get(`${base()}/drafts/${id}`).set('Authorization', bearer(actor));
const receipts = () =>
  rawDb.auditLog.findMany({
    where: { entityType: 'AnnouncementDraft' },
    orderBy: { createdAt: 'asc' },
  });

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  author = await createVolunteer({ email: `draft-author-${number++}@test.example`, role: 'ADMIN' });
  membershipId = (
    await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: author.id } })
  ).id;
});

it('saves attributed urgent content privately, with atomic audit and no inbox/ack/push', async () => {
  const push = vi.spyOn(notification, 'dispatch');
  const response = await create();
  expect(response.status).toBe(201);
  expect(response.headers['cache-control']).toBe('no-store');
  const draft = AnnouncementDraftRecord.parse(response.body.draft);
  expect(draft).toMatchObject({
    eventId,
    authorId: author.id,
    authorMembershipId: membershipId,
    version: 1,
    createdAt: FROZEN_NOW.toISOString(),
  });
  expect(await rawDb.announcement.count()).toBe(0);
  expect(push).not.toHaveBeenCalled();
  expect((await request(app).get(base()).set('Authorization', bearer(author))).body.data).toEqual(
    [],
  );
  expect(
    (await request(app).post(`${base()}/${draft.id}/ack`).set('Authorization', bearer(author)))
      .status,
  ).toBe(404);
  expect(await receipts()).toMatchObject([
    {
      actorId: author.id,
      actorSub: author.sub,
      membershipId,
      eventId,
      action: 'announcement.draft.create',
      entityId: draft.id,
    },
  ]);
});

it('lists and reads only the author’s own event drafts', async () => {
  const draft = (await create()).body.draft;
  const other = await createVolunteer({ email: 'other-draft-author@test.example', role: 'ADMIN' });
  expect((await read(draft.id)).body.draft).toEqual(draft);
  expect((await read(draft.id, other)).status).toBe(404);
  const list = (actor: TestVolunteer) =>
    request(app).get(`${base()}/drafts`).set('Authorization', bearer(actor));
  expect((await list(author)).body.data).toHaveLength(1);
  expect((await list(other)).body.data).toEqual([]);
  expect((await update(draft.id, { body: 'Intruder edit' }, other)).status).toBe(404);
});

async function foreignTargets() {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const other = await createEvent({
    organisationId: event.organisationId,
    slug: 'foreign-draft-event',
    name: 'Other Event',
    timezone: event.timezone,
    categories: [],
    stationTypes: [{ code: 'OTHER', label: 'Other' }],
    shiftTemplates: [],
  });
  const type = await rawDb.stationType.findFirstOrThrow({ where: { eventId: other.id } });
  const station = await rawDb.station.create({
    data: { eventId: other.id, typeId: type.id, code: 'FOREIGN', name: 'Foreign' },
  });
  const day = await rawDb.eventDay.create({
    data: { eventId: other.id, date: FROZEN_NOW, label: 'Foreign day' },
  });
  return { other, station, day };
}

it('does not expose a saved draft through another event membership', async () => {
  const draft = (await create()).body.draft;
  const { other } = await foreignTargets();
  await rawDb.eventMembership.create({
    data: { eventId: other.id, personId: author.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  expect(
    (
      await request(app)
        .get(`/api/v1/events/${other.id}/announcements/drafts/${draft.id}`)
        .set('Authorization', bearer(author))
    ).status,
  ).toBe(404);
});

it.each(['stationId', 'eventDayId'] as const)(
  'refuses foreign %s targets without writing',
  async (key) => {
    const { station, day } = await foreignTargets();
    expect(
      (await create({ target: { [key]: key === 'stationId' ? station.id : day.id } })).status,
    ).toBe(404);
    expect(await rawDb.announcementDraft.count()).toBe(0);
    expect(await receipts()).toHaveLength(0);
  },
);

it('supports bounded author pagination without leaking another author', async () => {
  await create({ body: 'First draft' });
  await create({ body: 'Second draft' });
  const first = await request(app)
    .get(`${base()}/drafts?limit=1`)
    .set('Authorization', bearer(author));
  expect(first.body.data).toHaveLength(1);
  const second = await request(app)
    .get(`${base()}/drafts?limit=1&cursor=${first.body.meta.nextCursor}`)
    .set('Authorization', bearer(author));
  expect(second.body.data).toHaveLength(1);
  expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
  expect(second.body.meta.nextCursor).toBeNull();
  const other = await createVolunteer({ email: 'private-cursor@test.example', role: 'ADMIN' });
  expect(
    (
      await request(app)
        .get(`${base()}/drafts?cursor=${first.body.data[0].id}`)
        .set('Authorization', bearer(other))
    ).status,
  ).toBe(404);
});

it('atomically replays creation by id using the current draft after a later edit', async () => {
  const key = idempotencyKey();
  const first = await create({ idempotencyKey: key });
  const changed = await update(first.body.draft.id, {
    body: 'Updated private text',
    reason: 'Correct wording',
  });
  expect(changed.status).toBe(200);
  expect(changed.body.draft.version).toBe(2);
  const replay = await create({ idempotencyKey: key });
  expect(replay.status).toBe(201);
  expect(replay.body.draft).toEqual(changed.body.draft);
  expect(await rawDb.announcementDraft.count()).toBe(1);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } })).responseBody,
  ).toEqual({ draftId: first.body.draft.id });
  expect(await receipts()).toHaveLength(2);
  expect((await receipts())[1]?.after).toMatchObject({
    version: 2,
    bodyChanged: true,
    reason: 'Correct wording',
  });
});

it('an identical replacement does not increment a version or fabricate a receipt', async () => {
  const draft = (await create()).body.draft;
  const response = await update(draft.id);
  expect(response.status).toBe(200);
  expect(response.body.draft).toEqual(draft);
  expect(await receipts()).toHaveLength(1);
});

it('concurrent edits with the same expected version have exactly one winner', async () => {
  const draft = (await create()).body.draft;
  const edits = await Promise.all([
    update(draft.id, { body: 'Winner A' }),
    update(draft.id, { body: 'Winner B' }),
  ]);
  expect(edits.map((response) => response.status).sort()).toEqual([200, 409]);
  expect((await read(draft.id)).body.draft).toEqual(
    edits.find((response) => response.status === 200)?.body.draft,
  );
  expect(await receipts()).toHaveLength(2);
});

it.each([
  { authorId: 'injected' },
  { runAt: FROZEN_NOW.toISOString() },
  { target: { stationId: 'any', extra: true } },
])('rejects untrusted extra input %j', async (extra) => {
  expect((await create(extra)).status).toBe(400);
  expect(await rawDb.announcementDraft.count()).toBe(0);
});

it('requires authentication and the announcement capability', async () => {
  const volunteer = await createVolunteer({
    email: 'draft-reader@test.example',
    role: 'VOLUNTEER',
  });
  expect((await request(app).post(`${base()}/drafts`).send(content)).status).toBe(401);
  expect((await create({}, volunteer)).status).toBe(403);
  expect(
    (await request(app).get(`${base()}/drafts`).set('Authorization', bearer(volunteer))).status,
  ).toBe(403);
});

it('applies the IC’s actual station authority to saving a draft', async () => {
  const day = await createEventDayToday();
  const station = await createStation({ code: 'DRAFT-STATION' });
  const ic = await createVolunteer({ email: 'draft-ic@test.example', role: 'IC' });
  await assignToStationAllBlocks({ volunteerId: ic.id, stationId: station.id, eventDayId: day.id });
  expect((await create({}, ic)).status).toBe(403);
  expect((await create({ target: { stationId: station.id } }, ic)).status).toBe(201);
  const other = await createStation({ code: 'OTHER-DRAFT-STATION' });
  expect((await create({ target: { stationId: other.id } }, ic)).status).toBe(403);
});

it('archived drafts remain readable while creation and edits refuse', async () => {
  const draft = (await create()).body.draft;
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  expect((await create()).status).toBe(409);
  expect((await update(draft.id, { body: 'After archive' })).status).toBe(409);
  expect((await read(draft.id)).body.draft).toEqual(draft);
});

it('expired content refuses at the inclusive expiry boundary', async () => {
  expect((await create({ expiresAt: FROZEN_NOW.toISOString() })).status).toBe(409);
  expect(await rawDb.announcementDraft.count()).toBe(0);
});

it('audit failure rolls back content and releases the retry reservation', async () => {
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Draft audit outage'));
  const key = idempotencyKey();
  expect((await create({ idempotencyKey: key })).status).toBe(500);
  expect(await rawDb.announcementDraft.count()).toBe(0);
  expect(await rawDb.idempotencyRecord.findUnique({ where: { key } })).toBeNull();
});

it('audit failure also rolls back an edit and its optimistic version', async () => {
  const draft = (await create()).body.draft;
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Draft edit audit outage'));
  expect((await update(draft.id, { body: 'Uncommitted edit' })).status).toBe(500);
  expect((await read(draft.id)).body.draft).toEqual(draft);
  expect(await receipts()).toHaveLength(1);
});

it('the committed id-only receipt survives an HTTP bookkeeping failure', async () => {
  vi.spyOn(replay, 'settle').mockRejectedValueOnce(new Error('HTTP settle outage'));
  const key = idempotencyKey();
  const first = await create({ idempotencyKey: key });
  expect(first.status).toBe(201);
  expect((await create({ idempotencyKey: key })).body.draft).toEqual(first.body.draft);
  expect(await rawDb.announcementDraft.count()).toBe(1);
  expect(await receipts()).toHaveLength(1);
});

it('database compound foreign keys also refuse foreign targets and author memberships', async () => {
  const { other, station } = await foreignTargets();
  const foreignMember = await rawDb.eventMembership.create({
    data: { eventId: other.id, personId: author.id, role: 'ADMIN' },
  });
  const data = {
    eventId,
    authorId: author.id,
    authorMembershipId: membershipId,
    body: 'Constraint probe',
  };
  await expect(
    rawDb.announcementDraft.create({ data: { ...data, targetStationId: station.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    rawDb.announcementDraft.create({ data: { ...data, authorMembershipId: foreignMember.id } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  expect(await rawDb.announcementDraft.count()).toBe(0);
});

it.each(['archive', 'membership', 'role', 'expiry'] as const)(
  'rechecks %s after waiting on Event',
  async (change) => {
    // Reserve before holding Event: its FK also takes a key-share lock, before the use case.
    const key = idempotencyKey();
    await reserve(key, { eventId, actorSub: author.sub, endpoint: 'announcement.draft.create' });
    let release!: () => void;
    let acquired!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const hold = rawDb.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
        if (change === 'archive')
          await tx.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
        if (change === 'membership')
          await tx.eventMembership.update({
            where: { id: membershipId },
            data: { status: 'DEACTIVATED' },
          });
        if (change === 'role')
          await tx.eventMembership.update({ where: { id: membershipId }, data: { role: 'IC' } });
        acquired();
        await waiting;
      },
      { timeout: 10_000 },
    );
    await locked;
    const entering = vi.spyOn(draftRepo, 'lockDraftEvent');
    const response = createDraft(
      CreateAnnouncementDraftRequest.parse({
        ...content,
        idempotencyKey: key,
        expiresAt: new Date(FROZEN_NOW.getTime() + 60_000).toISOString(),
      }),
      {
        volunteerId: author.id,
        membershipId,
        scope: { eventId },
        audit: {
          eventId,
          membershipId,
          actorId: author.id,
          actorSub: author.sub,
          ip: null,
          userAgent: null,
          requestId: null,
        },
      },
    ).then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => expect(entering).toHaveBeenCalled(), { timeout: 3000 });
      if (change === 'expiry') vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 60_000));
    } finally {
      release();
    }
    await hold;
    expect(await response).toMatchObject({
      code: change === 'membership' || change === 'role' ? 'FORBIDDEN' : 'CONFLICT',
    });
    expect(await rawDb.announcementDraft.count()).toBe(0);
    expect(await receipts()).toHaveLength(0);
  },
);
