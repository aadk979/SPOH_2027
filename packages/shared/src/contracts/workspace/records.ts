import { z } from 'zod';
import { Id, IsoDate, IsoDateTime } from '../common/index.js';
import { CardStatus, DataSource, IncidentSeverity, IncidentStatus, IncidentType,
  LostFoundStatus, LostPersonStatus, MembershipStatus } from '../../invariants/enums.js';

const time = { from: IsoDateTime.optional(), to: IsoDateTime.optional(),
  asOf: IsoDateTime.optional(), date: IsoDate.optional() };
const capture = { ...time, stationId: Id.optional(), personId: Id.optional(),
  source: DataSource.optional(), rehearsal: z.boolean().optional(),
  includeRehearsal: z.boolean().optional() };
const retained = { voided: z.boolean().optional() };
const mode = { rehearsal: z.boolean().optional(), includeRehearsal: z.boolean().optional() };
const pool = (filter: { kind: string; rehearsal?: boolean; includeRehearsal?: boolean }) =>
  filter.rehearsal === undefined || filter.includeRehearsal === undefined;
const observation = (filter: { kind: string; from?: string; to?: string; asOf?: string }) =>
  !(filter.from && filter.to && new Date(filter.from) >= new Date(filter.to));

/** Each branch admits only predicates implemented by that source's reader. */
export const RecordsFilter = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('registrations'), ...capture, ...retained,
    categoryId: Id.optional(), categoryCode: z.string().min(1).max(80).optional(), importBatchId: Id.optional(), groupId: Id.optional(), cardId: Id.optional() }).strict(),
  z.object({ kind: z.literal('footfall'), ...capture, ...retained,
    importBatchId: Id.optional(), countedStationsOnly: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('cards'), ...time, rehearsal: z.boolean().optional(),
    includeRehearsal: z.boolean().optional(), status: CardStatus.optional(),
    stage: z.enum(['issued', 'completed', 'redeemed', 'station']).optional(),
    stationId: Id.optional(), stationCode: z.string().min(1).max(80).optional(),
    groupId: Id.optional() }).strict(),
  z.object({ kind: z.literal('stamps'), ...capture, cardId: Id.optional(),
    excludeLost: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('redemptions'), ...capture, ...retained,
    giftTypeId: Id.optional(), cardId: Id.optional(), flagged: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('incidents'), ...time, ...mode, stationId: Id.optional(), personId: Id.optional(),
    status: IncidentStatus.optional(), open: z.boolean().optional(), severity: IncidentSeverity.optional(),
    incidentType: IncidentType.optional() }).strict(),
  z.object({ kind: z.literal('lost-person'), ...time, ...mode, stationId: Id.optional(), personId: Id.optional(),
    status: LostPersonStatus.optional() }).strict(),
  z.object({ kind: z.literal('lost-found'), ...time, ...mode, stationId: Id.optional(), personId: Id.optional(),
    status: LostFoundStatus.optional() }).strict(),
  z.object({ kind: z.literal('announcements'), ...time, stationId: Id.optional(), eventDayId: Id.optional(),
    personId: Id.optional(), priority: z.enum(['INFO', 'OPERATIONAL', 'URGENT']).optional() }).strict(),
  z.object({ kind: z.literal('assignments'), stationId: Id.optional(), personId: Id.optional(),
    eventDayId: Id.optional(), shiftId: Id.optional(), date: IsoDate.optional(), asOf: IsoDateTime.optional(),
    running: z.boolean().optional(), checkedIn: z.boolean().optional(), checkedOut: z.boolean().optional(),
    coverageGap: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('imports'), ...time, personId: Id.optional(), fallbackWindowId: Id.optional(),
    importType: z.enum(['REGISTRATION', 'FOOTFALL', 'ROSTER']).optional() }).strict(),
  z.object({ kind: z.literal('fallback'), ...time, ...mode, stationId: Id.optional(),
    open: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('gift-ledger'), giftTypeId: Id, rehearsal: z.boolean(),
    ...time }).strict(),
  z.object({ kind: z.literal('audit'), ...time, personId: Id.optional(), action: z.string().min(1).max(64).optional(),
    entityType: z.string().min(1).max(64).optional(), entityId: Id.optional() }).strict(),
  z.object({ kind: z.literal('people'), status: MembershipStatus.optional(),
    personId: Id.optional(), query: z.string().trim().max(120).optional() }).strict(),
  z.object({ kind: z.literal('days'), date: IsoDate.optional(), eventDayId: Id.optional() }).strict(),
]).refine(pool, 'Choose an exact rehearsal pool or rehearsal inclusion, not both.')
  .refine(observation, 'The end must be later than the start.')
  .refine((filter) => filter.kind !== 'cards' ||
    ((!filter.stationId && !filter.stationCode) || filter.stage === 'station'),
  'A station card predicate requires the station stage.')
  .refine((filter) => filter.kind !== 'cards' || filter.stage !== 'station' ||
    Boolean(filter.stationId || filter.stationCode), 'Choose a station for the station stage.')
  .refine((filter) => filter.kind !== 'assignments' || !filter.coverageGap ||
    (!filter.personId && filter.checkedIn === undefined && filter.checkedOut === undefined && filter.running !== false),
  'Coverage gaps are station and running-shift slots.')
  .refine((filter) => filter.kind !== 'incidents' || filter.open === undefined || filter.status === undefined,
  'Choose an exact incident status or the open-status group.');
export type RecordsFilter = z.infer<typeof RecordsFilter>;
export const RecordsKind = z.enum(['registrations', 'footfall', 'cards', 'stamps', 'redemptions',
  'incidents', 'lost-person', 'lost-found', 'announcements', 'assignments', 'imports',
  'fallback', 'gift-ledger', 'audit', 'people', 'days']);
export type RecordsKind = z.infer<typeof RecordsKind>;
/** A bounded source-qualified key is needed for a ledger combining two tables. */
export const WorkspaceRecordKey = z.string().min(1).max(160);
export const RecordsRequest = z.object({ filter: RecordsFilter,
  limit: z.number().int().min(1).max(200).default(50), cursor: WorkspaceRecordKey.optional() }).strict();
export type RecordsRequest = z.infer<typeof RecordsRequest>;
export const RecordsAggregate = z.object({ value: z.number().finite(),
  unit: z.enum(['registrations', 'roomEntries', 'cards', 'stampRows', 'redemptions',
    'incidents', 'alerts', 'items', 'announcements', 'assignments', 'imports', 'windows',
    'stock', 'auditRows', 'people', 'days', 'coverageSlots']),
  balance: z.number().int().optional(), openingStock: z.number().int().optional(),
  explanation: z.string().max(500).optional(),
}).strict();
export type RecordsAggregate = z.infer<typeof RecordsAggregate>;
