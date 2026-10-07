import { z } from 'zod';
import {
  GENERATED_SETTING_METADATA as metadata,
  GENERATED_SETTING_SCHEMAS as schemas,
  type GeneratedSettingKey,
} from '../../generated/settings/index.js';
import { EventStatus } from '../event/index.js';
import { Id, IsoDateTime } from '../common/index.js';

type OperationalKey = {
  [
    Key in GeneratedSettingKey
  ]: (typeof metadata)[Key]['requiredAction'] extends 'event.settings.manage'
    ? Exclude<Key, 'product.countsMode'>
    : never;
}[GeneratedSettingKey];

/** Product/privacy/security controls keep their specialised authority and value paths. */
export const SCOPED_OPERATIONAL_KEYS = (Object.keys(metadata) as GeneratedSettingKey[]).filter(
  (key) =>
    metadata[key].class === 'operational' &&
    metadata[key].requiredAction === 'event.settings.manage' &&
    key !== 'product.countsMode',
) as OperationalKey[];
export const ScopedOperationalSettingKey = z.enum(
  SCOPED_OPERATIONAL_KEYS as [OperationalKey, ...OperationalKey[]],
);
export type ScopedOperationalSettingKey = z.infer<typeof ScopedOperationalSettingKey>;
export const SettingReadScope = z.enum(['event', 'station']);
export type SettingReadScope = z.infer<typeof SettingReadScope>;
const LayerScope = z.enum(['platform', 'event', 'station']);

export function scopedOperationalKeys(scope: SettingReadScope): ScopedOperationalSettingKey[] {
  return SCOPED_OPERATIONAL_KEYS.filter((key) => {
    const scopes: readonly string[] = metadata[key].scopes;
    return scopes.includes(scope);
  });
}

function validateTarget(
  target: { scope: SettingReadScope; stationId?: string },
  ctx: z.RefinementCtx,
): void {
  if ((target.scope === 'station') !== (target.stationId !== undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['stationId'],
      message: 'Supply a station only for station scope',
    });
  }
}
export const ScopedSettingsReadQuery = z
  .object({ scope: SettingReadScope.default('event'), stationId: Id.optional() })
  .strict()
  .superRefine(validateTarget);
export type ScopedSettingsReadQuery = z.infer<typeof ScopedSettingsReadQuery>;
export const ScopedSettingsTarget = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('event') }).strict(),
  z.object({ scope: z.literal('station'), stationId: Id }).strict(),
]);
export type ScopedSettingsTarget = z.infer<typeof ScopedSettingsTarget>;

export const ScopedOperationalSetting = z
  .object({
    key: ScopedOperationalSettingKey,
    value: z.union([z.number(), z.boolean(), z.string(), z.array(z.string())]),
    source: z
      .object({
        scope: z.enum(['default', 'platform', 'event', 'station']),
        version: z.number().int().nonnegative(),
      })
      .strict(),
    storedVersion: z.number().int().nonnegative(),
    invalidScopes: z.array(LayerScope).max(3),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (!schemas[row.key].safeParse(row.value).success)
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Value does not match the registered setting',
      });
    const allowed: readonly string[] = metadata[row.key].scopes;
    if (row.source.scope !== 'default' && !allowed.includes(row.source.scope))
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'Source scope is not permitted for this setting',
      });
    if (row.source.scope === 'default' && row.source.version !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'Defaults have no stored version',
      });
    if (
      new Set(row.invalidScopes).size !== row.invalidScopes.length ||
      row.invalidScopes.some((scope) => !allowed.includes(scope))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['invalidScopes'],
        message: 'Invalid scope warnings must be unique permitted scopes',
      });
  });
export type ScopedOperationalSetting = z.infer<typeof ScopedOperationalSetting>;

type ScopedRead = {
  target: ScopedSettingsTarget;
  data: ScopedOperationalSetting[];
};
function validateKeys(response: ScopedRead, ctx: z.RefinementCtx): void {
  const expected = scopedOperationalKeys(response.target.scope);
  const keys = response.data.map((row) => row.key);
  if (
    keys.length !== expected.length ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !expected.includes(key))
  )
    ctx.addIssue({
      code: 'custom',
      path: ['data'],
      message: 'Supply each registered setting for this scope exactly once',
    });
}
function validateLayer(
  input: { scope: SettingReadScope; row: ScopedOperationalSetting; index: number },
  ctx: z.RefinementCtx,
): void {
  const { scope, row, index } = input;
  if (
    scope === 'event' &&
    (row.source.scope === 'station' || row.invalidScopes.includes('station'))
  )
    ctx.addIssue({
      code: 'custom',
      path: ['data', index],
      message: 'Event reads cannot contain station layers',
    });
  if (row.source.scope === scope && row.storedVersion !== row.source.version)
    ctx.addIssue({
      code: 'custom',
      path: ['data', index, 'storedVersion'],
      message: 'The selected override must match its source version',
    });
  if (row.source.scope !== scope && row.storedVersion !== 0 && !row.invalidScopes.includes(scope))
    ctx.addIssue({
      code: 'custom',
      path: ['data', index, 'storedVersion'],
      message: 'An inherited value cannot have a valid selected override',
    });
}

export const ScopedSettingsReadResponse = z
  .object({
    eventId: Id,
    target: ScopedSettingsTarget,
    eventStatus: EventStatus,
    evaluatedAt: IsoDateTime,
    data: z.array(ScopedOperationalSetting).max(SCOPED_OPERATIONAL_KEYS.length),
  })
  .strict()
  .superRefine((response, ctx) => {
    validateKeys(response, ctx);
    for (const [index, row] of response.data.entries())
      validateLayer({ scope: response.target.scope, row, index }, ctx);
  });
export type ScopedSettingsReadResponse = z.infer<typeof ScopedSettingsReadResponse>;
