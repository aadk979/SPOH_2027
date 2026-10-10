import { z } from 'zod';
import { attendanceFields } from './schemas/attendance.js';
import { authorizationFields } from './schemas/authorization.js';
import { authFields, authProviderRule, sessionRule } from './schemas/auth.js';
import { databaseFields, databasePoolRule, databaseSslRule } from './schemas/database.js';
import { pushFields, vapidRule } from './schemas/push.js';
import { corsWildcardRule, serverFields } from './schemas/server.js';
import { storageFields } from './schemas/storage.js';

/**
 * The configuration schema, composed from one schema per concern (server,
 * database, auth, storage, push, attendance). Each concern owns its fields and
 * its cross-field rules; the rules run in a fixed order so a misconfigured
 * boot lists its problems the same way every time. No side effects: parsing
 * happens in env.ts.
 */
const EnvSchema = z
  .object({
    ...serverFields,
    ...databaseFields,
    ...authFields,
    ...authorizationFields,
    ...attendanceFields,
    ...storageFields,
    ...pushFields,
  })
  .superRefine((env, ctx) => {
    for (const rule of [
      authProviderRule,
      databaseSslRule,
      databasePoolRule,
      sessionRule,
      vapidRule,
      corsWildcardRule,
    ]) {
      rule(env, ctx);
    }
  });

/** Every key the server reads, for the .env.example check. */
export const ENV_KEYS: readonly string[] = Object.keys(EnvSchema.shape);

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate. Exported for tests, which build an env from a fixture
 * rather than mutating `process.env`.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server configuration:\n${issues}`);
  }

  return result.data;
}
