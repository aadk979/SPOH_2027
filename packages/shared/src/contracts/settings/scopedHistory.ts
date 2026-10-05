import { z } from 'zod';
import { GENERATED_SETTING_SCHEMAS as schemas } from '../../generated/settings/index.js';
import { SettingChangeSource } from '../../invariants/enums.js';
import { Id, IsoDateTime, PaginationQuery, collection } from '../common/index.js';
import { EventStatus } from '../event/index.js';
import {
  ScopedOperationalSettingKey,
  ScopedSettingsTarget,
  SettingReadScope,
  scopedOperationalKeys,
} from './scopedRead.js';

export const ScopedSettingsHistoryQuery = PaginationQuery.extend({
  scope: SettingReadScope.default('event'),
  stationId: Id.optional(),
  key: ScopedOperationalSettingKey,
})
  .strict()
  .superRefine((query, ctx) => {
    const target = {
      scope: query.scope,
      ...(query.stationId ? { stationId: query.stationId } : {}),
    };
    if (!ScopedSettingsTarget.safeParse(target).success)
      ctx.addIssue({
        code: 'custom',
        path: ['stationId'],
        message: 'Supply a station only for station scope',
      });
    if (!scopedOperationalKeys(query.scope).includes(query.key))
      ctx.addIssue({
        code: 'custom',
        path: ['key'],
        message: 'Setting is unavailable at this scope',
      });
  });
export type ScopedSettingsHistoryQuery = z.infer<typeof ScopedSettingsHistoryQuery>;

const Value = z.union([z.number(), z.boolean(), z.string(), z.array(z.string())]);
const Values = z.union([
  z.object({ available: z.literal(false) }).strict(),
  z
    .object({ available: z.literal(true), operation: z.literal('reset'), before: Value.nullable() })
    .strict(),
  z
    .object({
      available: z.literal(true),
      operation: z.literal('set'),
      before: Value.nullable(),
      after: Value,
    })
    .strict(),
]);

/** A reset records removal, rather than guessing the effective value of an old inheritance chain. */
export const ScopedSettingsHistoryRecord = z
  .object({
    id: Id,
    key: ScopedOperationalSettingKey,
    version: z.number().int().positive(),
    source: SettingChangeSource,
    createdAt: IsoDateTime,
    createdByYou: z.boolean(),
    reason: z.string().max(500).nullable(),
    values: Values,
  })
  .strict()
  .superRefine((row, ctx) => {
    const values = row.values;
    if (values.available) {
      if (values.before !== null && !schemas[row.key].safeParse(values.before).success)
        ctx.addIssue({
          code: 'custom',
          path: ['values', 'before'],
          message: 'Invalid historical setting value',
        });
      if (values.operation === 'set' && !schemas[row.key].safeParse(values.after).success)
        ctx.addIssue({
          code: 'custom',
          path: ['values', 'after'],
          message: 'Invalid historical setting value',
        });
      if ((row.source === 'RESET') !== (values.operation === 'reset'))
        ctx.addIssue({
          code: 'custom',
          path: ['values', 'operation'],
          message: 'Historical operation does not match its source',
        });
    } else if (row.source === 'RESET')
      ctx.addIssue({
        code: 'custom',
        path: ['values'],
        message: 'A reset must describe removal of the override',
      });
  });
export type ScopedSettingsHistoryRecord = z.infer<typeof ScopedSettingsHistoryRecord>;

export const ScopedSettingsHistoryResponse = collection(ScopedSettingsHistoryRecord)
  .extend({
    eventId: Id,
    target: ScopedSettingsTarget,
    key: ScopedOperationalSettingKey,
    eventStatus: EventStatus,
    evaluatedAt: IsoDateTime,
    data: z.array(ScopedSettingsHistoryRecord).max(200),
  })
  .strict()
  .superRefine((response, ctx) => {
    if (!scopedOperationalKeys(response.target.scope).includes(response.key))
      ctx.addIssue({
        code: 'custom',
        path: ['key'],
        message: 'Setting is unavailable at this scope',
      });
    if (response.data.some((row) => row.key !== response.key))
      ctx.addIssue({
        code: 'custom',
        path: ['data'],
        message: 'Historical keys must match the selection',
      });
    if (
      response.meta.count !== response.data.length ||
      new Set(response.data.map(({ id }) => id)).size !== response.data.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['meta'],
        message: 'Historical collection metadata is inconsistent',
      });
    if (response.meta.nextCursor !== null && response.meta.nextCursor !== response.data.at(-1)?.id)
      ctx.addIssue({
        code: 'custom',
        path: ['meta', 'nextCursor'],
        message: 'Cursor must name the last returned row',
      });
  });
export type ScopedSettingsHistoryResponse = z.infer<typeof ScopedSettingsHistoryResponse>;
