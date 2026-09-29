import type { ListVolunteersQuery, VolunteerAdminRecord } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { toPage, type Page } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toAdminRecord } from '../data/mappers.js';
import { findVolunteerRow, listVolunteerRows } from '../data/repo.js';
import { assertMayActOn } from '../domain/escalation.js';
import type { ManagerContext } from './context.js';

export async function listVolunteers(
  scope: EventScope,
  query: ListVolunteersQuery,
): Promise<Page<VolunteerAdminRecord>> {
  const page = toPage(await listVolunteerRows(scope, query), query.limit);
  return { data: page.data.map((row) => toAdminRecord(row)), nextCursor: page.nextCursor };
}

export async function getVolunteer(scope: EventScope, id: string): Promise<VolunteerAdminRecord> {
  const row = await findVolunteerRow(scope, id);
  if (!row) throw new NotFoundError('Volunteer');
  return toAdminRecord(row);
}

/**
 * Load the member being changed, as the event knows them, and apply the two
 * escalation rules.
 */
export async function loadTarget(
  id: string,
  actor: ManagerContext,
  action: string,
): Promise<VolunteerAdminRecord> {
  const target = await getVolunteer(actor.scope, id);
  assertMayActOn(actor, target, action);
  return target;
}
