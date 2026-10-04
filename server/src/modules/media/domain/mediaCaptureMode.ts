import { z } from 'zod';

const IssuedMode = z.object({ rehearsal: z.boolean() });

/** Missing legacy provenance permits a historical read, never a new capture attachment. */
export function issuedRehearsal(after: unknown): boolean | null {
  const parsed = IssuedMode.safeParse(after);
  return parsed.success ? parsed.data.rehearsal : null;
}
