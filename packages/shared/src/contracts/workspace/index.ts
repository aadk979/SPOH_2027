import { z } from 'zod';
import { IsoDateTime } from '../common/index.js';
import { EntityRef, WorkspaceField, WorkspaceFacet } from './entities.js';
import { WorkspaceLink } from './destinations.js';
import { RecordsAggregate, RecordsFilter, WorkspaceRecordKey } from './records.js';
export * from './entities.js';
export * from './records.js';
export * from './destinations.js';
export * from './queries.js';

export const EntityResponse = z.object({ ref: EntityRef, title: z.string().max(240),
  fields: z.array(WorkspaceField).max(40), facets: z.array(WorkspaceFacet).max(20),
  related: z.array(WorkspaceLink).max(100), actions: z.array(WorkspaceLink).max(30), asOf: IsoDateTime }).strict();
export type EntityResponse = z.infer<typeof EntityResponse>;
export const RecordRow = z.object({ id: WorkspaceRecordKey, title: z.string().max(240),
  recordedAt: IsoDateTime.nullable(), fields: z.array(WorkspaceField).max(20),
  destination: EntityRef.nullable(), related: z.array(WorkspaceLink).max(20) }).strict();
export type RecordRow = z.infer<typeof RecordRow>;
export const RecordsResponse = z.object({ filter: RecordsFilter, asOf: IsoDateTime,
  data: z.array(RecordRow).max(200), aggregate: RecordsAggregate,
  meta: z.object({ count: z.number().int().nonnegative(), nextCursor: WorkspaceRecordKey.nullable() }).strict() }).strict();
export type RecordsResponse = z.infer<typeof RecordsResponse>;
export const SearchRequest = z.object({ query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).default(20) }).strict();
export type SearchRequest = z.infer<typeof SearchRequest>;
export const SearchResponse = z.object({ data: z.array(z.object({ title: z.string().max(240),
  detail: z.string().max(300), destination: EntityRef }).strict()).max(50),
  meta: z.object({ count: z.number().int().nonnegative(), truncated: z.boolean() }).strict() }).strict();
export type SearchResponse = z.infer<typeof SearchResponse>;
