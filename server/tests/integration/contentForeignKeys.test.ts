import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { guideContent } from '../helpers/content.js';
import { FROZEN_NOW } from '../setup.js';

let eventId: string;
let foreignEventId: string;
let personId: string;

beforeEach(async () => {
  await resetDatabase();
  const organisation = await rawDb.organisation.create({
    data: {
      slug: 'content-reference-tests',
      name: 'Content references',
      appName: 'Content tests',
      defaultTimezone: 'Asia/Singapore',
    },
  });
  const event = (slug: string) =>
    rawDb.event.create({
      data: { organisationId: organisation.id, slug, name: slug, timezone: 'Asia/Singapore' },
    });
  eventId = (await event('content-a')).id;
  foreignEventId = (await event('content-b')).id;
  personId = (
    await rawDb.person.create({
      data: {
        email: 'content-actor@references.test',
        displayName: 'Content actor',
        cognitoSub: 'content-reference-actor',
      },
    })
  ).id;
});

const draft = (
  patch: {
    updatedByPersonId?: string;
    reviewedByPersonId?: string;
    publishedVersionId?: string;
  } = {},
) =>
  rawDb.contentDocument.create({
    data: {
      eventId,
      body: guideContent(),
      updatedByPersonId: personId,
      updatedAt: FROZEN_NOW,
      ...patch,
    },
  });
const publication = (input: { event?: string; actor?: string } = {}) => {
  const id = randomUUID();
  return rawDb.contentVersion.create({
    data: {
      id,
      eventId: input.event ?? eventId,
      version: 1,
      draftVersion: 1,
      body: guideContent(),
      objectKey: `content/${id}.json`,
      etag: '"reference-test"',
      publishedByPersonId: input.actor ?? personId,
      publishedAt: FROZEN_NOW,
    },
  });
};
const receipt = (actor = personId) => {
  const id = randomUUID();
  return rawDb.contentUploadReceipt.create({
    data: {
      id,
      eventId,
      key: `content/${eventId}/${id}.png`,
      contentType: 'image/png',
      contentLength: 12,
      issuedByPersonId: actor,
      createdAt: FROZEN_NOW,
    },
  });
};

const ACTOR_REFERENCES: Record<string, (actor: string) => Promise<unknown>> = {
  'draft updater': (actor) => draft({ updatedByPersonId: actor }),
  'draft reviewer': (actor) => draft({ reviewedByPersonId: actor }),
  publisher: (actor) => publication({ actor }),
  'image receipt issuer': (actor) => receipt(actor),
};

describe('content attribution foreign keys', () => {
  it.each(Object.keys(ACTOR_REFERENCES))('rejects a missing %s', async (reference) => {
    await expect(ACTOR_REFERENCES[reference]!('missing-content-actor')).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it.each(Object.keys(ACTOR_REFERENCES))('retains a referenced %s', async (reference) => {
    await ACTOR_REFERENCES[reference]!(personId);
    await expect(rawDb.person.delete({ where: { id: personId } })).rejects.toMatchObject({
      code: 'P2003',
    });
    expect(await rawDb.person.findUnique({ where: { id: personId } })).not.toBeNull();
  });
});

describe('current publication composite foreign key', () => {
  it('allows an unpublished, unreviewed draft and a publication in its own event', async () => {
    const document = await draft();
    expect(document).toMatchObject({ reviewedByPersonId: null, publishedVersionId: null });
    const published = await publication();
    await expect(
      rawDb.contentDocument.update({
        where: { id: document.id },
        data: { publishedVersionId: published.id },
      }),
    ).resolves.toMatchObject({ eventId, publishedVersionId: published.id });
  });

  it.each(['foreign event', 'missing publication'])(
    'rejects %s on draft creation',
    async (target) => {
      const publishedVersionId =
        target === 'foreign event'
          ? (await publication({ event: foreignEventId })).id
          : 'missing-content-version';
      await expect(draft({ publishedVersionId })).rejects.toMatchObject({ code: 'P2003' });
    },
  );

  it.each(['foreign event', 'missing publication'])(
    'rejects %s on draft update',
    async (target) => {
      const published = await publication();
      const document = await draft({ publishedVersionId: published.id });
      const invalidId =
        target === 'foreign event'
          ? (await publication({ event: foreignEventId })).id
          : 'missing-content-version';
      await expect(
        rawDb.contentDocument.update({
          where: { id: document.id },
          data: { publishedVersionId: invalidId },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      expect(await rawDb.contentDocument.findUnique({ where: { id: document.id } })).toMatchObject({
        eventId,
        publishedVersionId: published.id,
      });
    },
  );

  it('refuses deletion of the current publication until the document is removed', async () => {
    const published = await publication();
    const document = await draft({ publishedVersionId: published.id });
    await expect(
      rawDb.contentVersion.delete({ where: { id: published.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await rawDb.contentDocument.delete({ where: { id: document.id } });
    await expect(
      rawDb.contentVersion.delete({ where: { id: published.id } }),
    ).resolves.toMatchObject({ id: published.id });
  });
});

describe('handoff session foreign key', () => {
  const handoff = (sessionId: string) =>
    rawDb.authHandoff.create({
      data: {
        id: randomUUID(),
        sessionId,
        challenge: 'synthetic-handoff-challenge',
        expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
      },
    });

  it('rejects a handoff for a missing session', async () => {
    await expect(handoff('missing-refresh-session')).rejects.toMatchObject({ code: 'P2003' });
  });

  it('removes only the handoffs of a deleted session', async () => {
    const session = () =>
      rawDb.refreshSession.create({
        data: {
          volunteerId: personId,
          tokenHash: randomUUID(),
          familyId: randomUUID(),
          expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
        },
      });
    const expired = await session();
    const retained = await session();
    const removed = await handoff(expired.id);
    const surviving = await handoff(retained.id);
    await rawDb.refreshSession.delete({ where: { id: expired.id } });
    expect(await rawDb.authHandoff.findUnique({ where: { id: removed.id } })).toBeNull();
    expect(await rawDb.authHandoff.findUnique({ where: { id: surviving.id } })).toMatchObject({
      sessionId: retained.id,
    });
  });
});
