import { EventContent } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { insertImageReceipt, publishedRow, saveDraftRow } from '../data/repo.js';
import { remapContent } from '../domain/cloneContent.js';
import { contentReferences } from '../domain/contentRules.js';
import { contentStorage } from './storage.js';
import { imageManifest } from '../domain/imageManifest.js';
import { type CloneContentStoragePlan } from './cloneStoragePlan.js';
import { requireStoragePlan, assertPlannedKeys } from './storagePlan.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { ERROR_CODES } from '@spoh/shared';

type CloneInput = {
  sourceEventId: string; eventId: string; personId: string; now: Date;
  stationIds: ReadonlyMap<string, string>; stationTagIds?: ReadonlyMap<string, string>;
  storagePlan?: CloneContentStoragePlan;
};

async function requireCloneImagePlan(tx: PrismaTransactionClient, input: CloneInput,
  source: { id: string; body: unknown }) {
  const keys = contentReferences(EventContent.parse(source.body)).images;
  if (!keys.length) return;
  const plan = input.storagePlan;
  if (!plan || plan.sourceVersionId !== source.id || plan.eventId !== input.sourceEventId)
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Prepare a fresh content clone storage plan before copying images.');
  const stored = await requireStoragePlan(tx, { eventId: input.sourceEventId },
    { id: plan.id, targetEventId: input.eventId, now: input.now });
  assertPlannedKeys(stored, plan.images.map((image) => image.key));
}

/** Only a committed publication is copied. The clone requires a fresh review and publish. */
export async function cloneContentInto(
  tx: PrismaTransactionClient,
  input: CloneInput,
) {
  const source = await publishedRow({ eventId: input.sourceEventId }, {}, tx);
  if (!source) return false;
  const body = EventContent.parse(source.body);
  const manifest = imageManifest.parse(source.imageManifest);
  const sourceKeys = contentReferences(body).images;
  const plan = input.storagePlan;
  await requireCloneImagePlan(tx, input, source);
  const images = new Map<string, string>();
  const scope = { eventId: input.eventId };
  for (const sourceKey of sourceKeys) {
    const planned = plan?.images.find((image) => image.sourceKey === sourceKey);
    if (!planned) throw new ConflictError(ERROR_CODES.CONFLICT, 'The source floor plans changed. Prepare the clone again.');
    const id = planned.key.split('/').at(-1)!;
    const copied = await contentStorage().copyImage({
      sourceKey,
      key: planned.key,
      receipt: manifest.find((image) => image.key === sourceKey),
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
