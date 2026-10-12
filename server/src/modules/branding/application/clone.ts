import { randomUUID } from 'node:crypto';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { eventBranding, saveBranding } from '../data/repo.js';
import { currentPublication, emptyRegistry, readRegistry } from '../domain/registry.js';
import { brandingStorage } from './storage.js';
import { approvedAsset } from './assetBoundary.js';

/** Existing clone owns authority/audit/receipt and locks. Only approved appearance is copied. */
export async function cloneBrandingInto(tx: PrismaTransactionClient, input: { sourceScope: EventScope; targetScope: EventScope; copySettings: boolean }): Promise<void> {
  const registry = emptyRegistry();
  const source = input.copySettings ? currentPublication(readRegistry((await eventBranding(input.sourceScope, tx)).branding)) : null;
  if (source) {
    const id = randomUUID();
    const images = [];
    for (const asset of source.assets ?? []) images.push({ variant: asset.variant, body: await brandingStorage().read(approvedAsset(input.sourceScope, { publicationId: source.id, asset })) });
    registry.draftAssets = images.length ? await brandingStorage().put({ prefix: `drafts/${input.targetScope.eventId}/branding-normalized/${id}`, images }) : null;
    registry.draft = { accent: source.accent, logoAlt: source.alt, uploadReceiptId: registry.draftAssets ? id : null };
    registry.version = 1;
  }
  await saveBranding(input.targetScope, { tx, registry });
}
