import type { SessionSummary } from '@spoh/shared';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toSessionSummary } from '../data/mappers.js';
import { listLiveSessions } from '../data/repo.js';

/** The caller's live sessions, newest first, marking the one making this request. */
export async function listSessions(
  volunteerId: string,
  currentSessionId: string | null,
  clock: Clock = systemClock,
): Promise<SessionSummary[]> {
  const rows = await listLiveSessions(volunteerId, clock.now());
  return rows.map((row) => toSessionSummary(row, currentSessionId));
}
