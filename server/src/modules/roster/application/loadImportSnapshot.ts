import type { RosterImportRequest } from '@spoh/shared';
import {
  eventDayIdsByDate,
  existingSlots,
  findVolunteerByEmail,
  stationIdsByCode,
  type Volunteer,
} from '../data/repo.js';
import type { ImportSnapshot } from '../domain/planRosterImport.js';
import { assertMayManage } from '../domain/escalation.js';
import type { RosterActor } from './context.js';

/**
 * Load every existing account the file names, refusing the whole import if any
 * row would breach the escalation rules. All or nothing: a half-applied roster
 * is worse than none, and the importer fixes the file and re-runs the preview.
 */
async function loadExisting(request: RosterImportRequest, actor: RosterActor) {
  const existing = new Map<string, Volunteer>();
  for (const [index, row] of request.rows.entries()) {
    if (!existing.has(row.email)) {
      const found = await findVolunteerByEmail(row.email);
      if (found) existing.set(row.email, found);
    }
    assertMayManage(
      actor,
      { role: row.role, existing: existing.get(row.email) ?? null },
      `Row ${index + 1}: `,
    );
  }
  return existing;
}

/** The roster as the plan needs it: accounts, stations, days and held slots. */
export async function loadImportSnapshot(
  request: RosterImportRequest,
  actor: RosterActor,
): Promise<ImportSnapshot & { accounts: ReadonlyMap<string, Volunteer> }> {
  const accounts = await loadExisting(request, actor);
  const [stationIdByCode, eventDayIdByDate, heldSlots] = await Promise.all([
    stationIdsByCode(),
    eventDayIdsByDate(),
    existingSlots([...accounts.values()].map((account) => account.id)),
  ]);
  return { existing: accounts, accounts, stationIdByCode, eventDayIdByDate, heldSlots };
}
