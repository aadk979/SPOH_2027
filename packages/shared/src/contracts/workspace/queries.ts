import { z } from 'zod';
import { Id } from '../common/index.js';
import { EntityKind, EntityRef } from './entities.js';
import { RecordsRequest } from './records.js';

export const EntityQuery = z.object({ kind: EntityKind, id: Id,
  via: z.literal('assignment').optional(), assignmentId: Id.optional() }).strict()
  .refine((query) => Boolean(query.via) === Boolean(query.assignmentId), 'An assignment relation requires its identifier.')
  .refine((query) => !query.via || ['person', 'event-day', 'shift'].includes(query.kind), 'This reference does not accept an assignment relation.')
  .transform((query) => EntityRef.parse({ kind: query.kind, id: query.id,
    ...(query.assignmentId ? { via: { kind: 'assignment', assignmentId: query.assignmentId } } : {}) }));
export type EntityQuery = z.infer<typeof EntityQuery>;
const booleanFields = new Set(['rehearsal', 'includeRehearsal', 'voided', 'countedStationsOnly',
  'excludeLost', 'flagged', 'open', 'running', 'checkedIn', 'checkedOut', 'coverageGap']);
/** URL values are strings. Arrays/repeated keys and unimplemented predicates are rejected. */
export const RecordsQuery = z.record(z.string(), z.string()).transform((query, context) => {
  const { limit, cursor, ...rawFilter } = query;
  const filter: Record<string, unknown> = { ...rawFilter };
  for (const [key, value] of Object.entries(rawFilter)) {
    if (!booleanFields.has(key)) continue;
    if (value !== 'true' && value !== 'false') {
      context.addIssue({ code: 'custom', message: `Invalid boolean ${key}.` }); return z.NEVER;
    }
    filter[key] = value === 'true';
  }
  const parsed = RecordsRequest.safeParse({ filter, ...(limit === undefined ? {} : { limit: Number(limit) }),
    ...(cursor === undefined ? {} : { cursor }) });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    return z.NEVER;
  }
  return parsed.data;
});
export const SearchQuery = z.object({ query: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
