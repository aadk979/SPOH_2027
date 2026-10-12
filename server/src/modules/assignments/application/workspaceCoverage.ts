import { createHash } from 'node:crypto';
import type { RecordRow, RecordsRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { readableCollectionStations, entityLink, field, recordsProjection } from '../../../platform/workspace/sourceRead.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { coverageAssigned, coverageCheckedIn, coverageShifts, coverageStations } from '../data/workspaceRepo.js';
import { observedTime } from '../../../platform/workspace/observation.js';

interface CoverageCell { stationId: string; stationName: string; shiftId: string; shiftLabel: string;
  eventDayId: string; assigned: number; checkedIn: number }

function coverageRecord(cell: CoverageCell, structureReadable: boolean): RecordRow {
  return { id: createHash('sha256').update(`${cell.stationId}\0${cell.shiftId}`).digest('hex'),
    title: `${cell.stationName} · ${cell.shiftLabel}`.slice(0, 240), recordedAt: null,
    destination: { kind: 'station', id: cell.stationId }, fields: [field('Assigned', cell.assigned, 'number'),
      field('Checked in', cell.checkedIn, 'number'), field('Missing', Math.max(0, cell.assigned - cell.checkedIn), 'number'),
      field('Coverage', cell.assigned === 0 ? 'UNSTAFFED' : cell.checkedIn === 0 ? 'NOBODY_CHECKED_IN' : cell.checkedIn < cell.assigned ? 'PARTIAL' : 'COMPLETE')],
    related: structureReadable ? [entityLink('Shift', { kind: 'shift', id: cell.shiftId }),
      entityLink('Event day', { kind: 'event-day', id: cell.eventDayId })] : [] };
}

async function coverageRows(context: ReadContext, input: RecordsRequest) {
  if (input.filter.kind !== 'assignments') throw new ValidationError('Choose assignment coverage.');
  const filter = input.filter;
  const stationIds = await readableCollectionStations(context, 'Dashboard.ReadStation', filter.stationId);
  const selection = { filter, stationIds, asOf: (await observedTime(context,
    filter.asOf ? { asOf: filter.asOf } : {})).lte };
  const stations = await coverageStations(context.scope, context.db, selection);
  const shifts = await coverageShifts(context.scope, context.db, selection);
  const assigned = await coverageAssigned(context.scope, context.db, selection);
  const checkedIn = await coverageCheckedIn(context.scope, context.db, selection);
  const structureReadable = await context.canRead({ action: 'Structure.Read', resource: { type: 'Event', id: context.scope.eventId } });
  const cells = shifts.flatMap((shift) => stations.map((station): CoverageCell => ({ stationId: station.id,
    stationName: station.name, shiftId: shift.id, shiftLabel: shift.template.label, eventDayId: shift.eventDayId,
    assigned: assigned.find((row) => row.stationId === station.id && row.shiftId === shift.id)?._count.id ?? 0,
    checkedIn: checkedIn.find((row) => row.stationId === station.id && row.shiftId === shift.id)?._count.id ?? 0 })));
  return cells.filter((cell) => (cell.assigned === 0 || cell.checkedIn !== cell.assigned) === filter.coverageGap)
    .map((cell) => coverageRecord(cell, structureReadable)).sort((left, right) => left.id.localeCompare(right.id));
}

export async function readCoverage(context: ReadContext, input: RecordsRequest) {
  const rows = await coverageRows(context, input);
  const anchor = input.cursor ? rows.findIndex((row) => row.id === input.cursor) : -1;
  if (input.cursor && anchor === -1) throw new NotFoundError('Records cursor');
  const page = rows.slice(anchor + 1, anchor + input.limit + 2);
  const data = page.slice(0, input.limit);
  return recordsProjection(context, input, { data, count: rows.length, aggregate: { value: rows.length, unit: 'coverageSlots',
    explanation: 'One slot is one active station on one running materialized shift.' },
    nextCursor: page.length > input.limit ? data.at(-1)!.id : null });
}
