import { randomUUID } from 'node:crypto';
import { EventContent } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { insertImageReceipt, publishedRow, saveDraftRow } from '../data/repo.js';
import { remapContent } from '../domain/cloneContent.js';
import { contentReferences } from '../domain/contentRules.js';
import { contentStorage } from './storage.js';

/** Only a committed publication is copied. The clone requires a fresh review and publish. */
export async function cloneContentInto(
  tx: PrismaTransactionClient,
  input: {
    sourceEventId: string;
    eventId: string;
    personId: string;
    now: Date;
    stationIds: ReadonlyMap<string, string>;
    stationTagIds?: ReadonlyMap<string, string>;
  },
) {
  const source = await publishedRow({ eventId: input.sourceEventId }, {}, tx);
  if (!source) return false;
  const body = EventContent.parse(source.body);
  const images = new Map<string, string>();
  const scope = { eventId: input.eventId };
  for (const sourceKey of contentReferences(body).images) {
    const id = randomUUID();
    const copied = await contentStorage().copyImage({
      sourceKey,
      key: `drafts/${input.eventId}/${id}`,
    });
    await insertImageReceipt(scope, {
      tx,
      id,
      ...copied,
      personId: input.personId,
      now: input.now,
    });
    images.set(sourceKey, copied.key);
  }
  await saveDraftRow(scope, {
    tx,
    version: 0,
    personId: input.personId,
    now: input.now,
    body: remapContent({
      body,
      stationIds: input.stationIds,
      stationTagIds: input.stationTagIds ?? input.stationIds,
      images,
    }),
  });
  return true;
}
