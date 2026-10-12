import { z } from 'zod';
import { Id } from '../common/index.js';

export const BrandingAccent = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour').transform((value) => value.toLowerCase());
export const BrandingAlt = z.string().trim().min(1).max(160);
export const FrozenBranding = z.object({
  schemaVersion: z.literal(1),
  publicationId: Id.nullable(),
  publicationVersion: z.number().int().positive().nullable(),
  accent: BrandingAccent,
  logo: z.object({ publicationId: Id, variant: z.literal('logo'), sha256: z.string().regex(/^[a-f0-9]{64}$/), alt: BrandingAlt }).strict().nullable(),
}).strict().refine((value) =>
  (value.publicationId === null) === (value.publicationVersion === null) &&
  (!value.logo || value.logo.publicationId === value.publicationId),
{ message: 'The frozen logo must belong to its publication' });
export type FrozenBranding = z.infer<typeof FrozenBranding>;
