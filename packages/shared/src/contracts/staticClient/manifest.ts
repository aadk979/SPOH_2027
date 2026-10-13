import { z } from 'zod';

export const STATIC_MANIFEST_MAX_BYTES = 2 * 1024 * 1024;
export const compareStaticPaths = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const HASH = /^'sha256-[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]='$/;

export function isStaticDocumentPath(path: string): boolean {
  // eslint-disable-next-line no-control-regex -- Static paths must exclude all control characters.
  return path.endsWith('.html') && !/[\\%?#\x00-\x20\x7f:]/.test(path) &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && !part.startsWith('.'));
}
function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || compareStaticPaths(values[index - 1]!, value) < 0);
}
export const StaticScriptHashesSchema = z.array(z.string().regex(HASH)).max(128);
export const StaticDocumentSchema = z.strictObject({
  path: z.string().min(1).max(2048).refine(isStaticDocumentPath),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  scriptHashes: StaticScriptHashesSchema,
});
export const StaticClientManifestSchema = z.strictObject({
  version: z.literal(1), documents: z.array(StaticDocumentSchema).min(1).max(10000),
}).superRefine((value, context) => {
  if (!sortedUnique(value.documents.map((document) => document.path)) ||
      value.documents.some((document) => !sortedUnique(document.scriptHashes))) {
    context.addIssue({ code: 'custom', message: 'Static manifest entries must be sorted and unique' });
  }
  for (const required of ['index.html', '404.html']) {
    if (!value.documents.some((document) => document.path === required))
      context.addIssue({ code: 'custom', message: 'Static manifest requires index and 404 documents' });
  }
});
export type StaticDocument = z.infer<typeof StaticDocumentSchema>;
export type StaticClientManifest = z.infer<typeof StaticClientManifestSchema>;
export type ObservedStaticDocument = StaticDocument;

/** Hosts supply observations of actual bytes AND browser-parsed script text. No I/O belongs here. */
export function validateStaticClientManifest(raw: unknown, observed: readonly ObservedStaticDocument[]): StaticClientManifest {
  const manifest = StaticClientManifestSchema.parse(raw);
  const actual = StaticClientManifestSchema.parse({ version: 1, documents: observed });
  if (JSON.stringify(manifest.documents) !== JSON.stringify(actual.documents))
    throw new Error('Static manifest does not match the complete HTML export');
  return manifest;
}

/** Validate callers of the policy builder independently of manifest parsing. */
export function validateStaticScriptHashes(hashes: readonly string[]): void {
  if (hashes.length > 128 || hashes.some((hash) => !HASH.test(hash)) || !sortedUnique(hashes))
    throw new Error('Invalid static script hashes');
}
