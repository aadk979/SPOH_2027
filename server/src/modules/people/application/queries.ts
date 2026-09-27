import type { ListVolunteersQuery, VolunteerAdminRecord } from '@spoh/shared';
import { toPage, type Page } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toAdminRecord } from '../data/mappers.js';
import { findVolunteerRow, listVolunteerRows, type AdminRow } from '../data/repo.js';
import { assertMayActOn } from '../domain/escalation.js';
import type { ManagerContext } from './context.js';

export async function listVolunteers(
  query: ListVolunteersQuery,
): Promise<Page<VolunteerAdminRecord>> {
  const page = toPage(await listVolunteerRows(query), query.limit);
  return { data: page.data.map((row) => toAdminRecord(row)), nextCursor: page.nextCursor };
}

export async function getVolunteer(id: string): Promise<VolunteerAdminRecord> {
  const row = await findVolunteerRow(id);
  if (!row) throw new NotFoundError('Volunteer');
  return toAdminRecord(row);
}

/** Load the person being changed and apply the two escalation rules. */
export async function loadTarget(
  id: string,
  actor: ManagerContext,
  action: string,
): Promise<AdminRow> {
  const row = await findVolunteerRow(id);
  if (!row) throw new NotFoundError('Volunteer');
  assertMayActOn(actor, row, action);
  return row;
}
