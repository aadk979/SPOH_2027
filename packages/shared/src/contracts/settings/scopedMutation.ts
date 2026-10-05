import { z } from 'zod';
import { GENERATED_SETTING_SCHEMAS as schemas } from '../../generated/settings/index.js';
import { Id, IdempotencyKey } from '../common/index.js';
import {
  ScopedOperationalSettingKey,
  ScopedSettingsReadResponse,
  ScopedSettingsTarget,
  scopedOperationalKeys,
} from './scopedRead.js';

const Version = z.number().int().nonnegative();
const common = {
  target: ScopedSettingsTarget,
  key: ScopedOperationalSettingKey,
  expectedVersion: Version,
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: IdempotencyKey,
};
const request = z.discriminatedUnion('operation', [
  z
    .object({
      ...common,
      operation: z.literal('set'),
      value: z.union([z.number(), z.boolean(), z.string(), z.array(z.string())]),
    })
    .strict(),
  z.object({ ...common, operation: z.literal('reset') }).strict(),
]);

/** Every public write stays within the same generated operational selection as reads. */
export const ScopedSettingsMutationRequest = request
  .superRefine((input, ctx) => {
    if (!scopedOperationalKeys(input.target.scope).includes(input.key))
      ctx.addIssue({
        code: 'custom',
        path: ['key'],
        message: 'Setting is unavailable at this scope',
      });
    if (input.operation === 'set' && !schemas[input.key].safeParse(input.value).success)
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Value does not match the registered setting',
      });
  })
  .transform((input) =>
    input.operation === 'set' ? { ...input, value: schemas[input.key].parse(input.value) } : input,
  );
export type ScopedSettingsMutationRequest = z.infer<typeof ScopedSettingsMutationRequest>;

export const ScopedSettingsMutationResponse = z
  .object({
    change: z
      .object({
        id: Id,
        key: ScopedOperationalSettingKey,
        operation: z.enum(['set', 'reset']),
        version: z.number().int().positive(),
      })
      .strict(),
    reviewedVersion: Version,
    current: ScopedSettingsReadResponse,
  })
  .strict()
  .superRefine((response, ctx) => {
    if (!scopedOperationalKeys(response.current.target.scope).includes(response.change.key))
      ctx.addIssue({
        code: 'custom',
        path: ['change', 'key'],
        message: 'Change is unavailable at this scope',
      });
    if (response.change.version <= response.reviewedVersion)
      ctx.addIssue({
        code: 'custom',
        path: ['change', 'version'],
        message: 'A change must advance the reviewed version',
      });
  });
export type ScopedSettingsMutationResponse = z.infer<typeof ScopedSettingsMutationResponse>;
