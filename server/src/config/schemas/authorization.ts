import { z } from 'zod';

/**
 * The environment's Amazon Verified Permissions policy store (P11.6, ADR-005 §6). Absent in
 * development and test, where the local Cedar engine decides from the same policies.
 */
export const authorizationFields = {
  AVP_POLICY_STORE_ID: z.string().min(1).optional(),
  /** JSON: the store's policy ids to the `@id`s the local engine reports (written by CDK). */
  AVP_POLICY_NAMES: z
    .string()
    .optional()
    .transform((value, ctx): Record<string, string> | undefined => {
      if (value === undefined || value === '') return undefined;
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, string>;
        }
      } catch {
        // reported below
      }
      ctx.addIssue({ code: 'custom', message: 'must be a JSON object of policy ids to names' });
      return z.NEVER;
    }),
};
