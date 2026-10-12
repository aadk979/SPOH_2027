import { z } from 'zod';
import { BrandingAccent, BrandingDraft, BrandingVariant, Id } from '@spoh/shared';

export const NEUTRAL_ACCENT = '#0066cc';
export const REGISTRY_LIMIT = 32;
export const REGISTRY_BUDGET = 64 * 1024;
export const StoredAsset = z.object({
  variant: BrandingVariant, key: z.string().min(1).max(240), versionId: z.string().min(1).max(240).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive().max(1024 * 1024),
}).strict();
export type StoredAsset = z.infer<typeof StoredAsset>;
export const AssetSet = z.array(StoredAsset).length(4).refine((assets) => new Set(assets.map((asset) => asset.variant)).size === 4);
export type AssetSet = z.infer<typeof AssetSet>;
export const Publication = z.object({ id: Id, version: z.number().int().positive(), accent: BrandingAccent, alt: z.string().min(1).max(160).nullable(), assets: AssetSet.nullable() }).strict()
  .refine((value) => !value.assets || value.alt !== null, { message: 'Approved logos require alternative text' });
export type Publication = z.infer<typeof Publication>;
export const BrandingRegistry = z.object({
  schemaVersion: z.literal(1), version: z.number().int().nonnegative(), draft: BrandingDraft,
  draftAssets: AssetSet.nullable(), publishedId: Id.nullable(), publications: z.array(Publication).max(REGISTRY_LIMIT),
}).strict().refine((value) =>
  new Set(value.publications.map((item) => item.id)).size === value.publications.length &&
  value.publications.every((item, index) => index === 0 || item.version > value.publications[index - 1]!.version) &&
  (!value.publishedId || value.publications.some((item) => item.id === value.publishedId)) &&
  (!value.draftAssets || !!value.draft.uploadReceiptId),
{ message: 'Branding references must belong to this registry' });
export type BrandingRegistry = z.infer<typeof BrandingRegistry>;

/** Legacy JSON has never established consent to publish identity or objects. */
export function readRegistry(value: unknown): BrandingRegistry {
  const parsed = BrandingRegistry.safeParse(value);
  return parsed.success ? parsed.data : emptyRegistry();
}
export function emptyRegistry(): BrandingRegistry {
  return { schemaVersion: 1, version: 0, draft: { accent: NEUTRAL_ACCENT, logoAlt: null, uploadReceiptId: null }, draftAssets: null, publishedId: null, publications: [] };
}
export function currentPublication(value: BrandingRegistry): Publication | null {
  return value.publications.find((item) => item.id === value.publishedId) ?? null;
}
