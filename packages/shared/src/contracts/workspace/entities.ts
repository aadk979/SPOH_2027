import { z } from 'zod';
import { Id, IsoDateTime } from '../common/index.js';

export const EntityKind = z.enum(['station', 'person', 'event-day', 'shift', 'card',
  'incident', 'lost-person', 'lost-found', 'announcement', 'fallback', 'import',
  'assignment', 'registration', 'footfall', 'redemption', 'gift', 'audit']);
export type EntityKind = z.infer<typeof EntityKind>;
export const EntityVia = z.object({ kind: z.literal('assignment'), assignmentId: Id }).strict();
export type EntityVia = z.infer<typeof EntityVia>;
export const EntityRef = z.object({ kind: EntityKind, id: Id, via: EntityVia.optional() }).strict();
export type EntityRef = z.infer<typeof EntityRef>;
export const WorkspaceField = z.object({
  label: z.string().min(1).max(120),
  value: z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]),
  format: z.enum(['text', 'instant', 'date', 'number', 'boolean']).default('text'),
}).strict();
export type WorkspaceField = z.infer<typeof WorkspaceField>;
export const WorkspaceFacet = z.object({ name: z.string().max(120),
  availability: z.enum(['available', 'denied', 'unavailable']), explanation: z.string().max(300).optional(),
}).strict();
export const WorkspaceObservation = z.object({ asOf: IsoDateTime,
  from: IsoDateTime.optional(), to: IsoDateTime.optional() }).strict();
