import { z } from 'zod';
import {
  BriefingSlotRecord,
  EventDayRecord,
  ShiftAssignmentRecord,
  StationSummary,
  SwapRequestRecord,
  SwapTargetRecord,
  VolunteerAdminRecord,
  type CreateAssignmentRequest,
  type CreateBriefingSlotRequest,
  type CreateSwapRequest,
  type DecideSwapRequest,
  type UpdateVolunteerRequest,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

const read = (eventId: string, path: string, signal?: AbortSignal) =>
  eventApi<unknown>(eventId, path, { cache: 'no-store', ...(signal ? { signal } : {}) });
const list = <T extends z.ZodType>(schema: T, body: unknown): z.output<T>[] =>
  z.object({ data: z.array(schema) }).parse(body).data;
export const listStaffingDays = async (eventId: string, signal?: AbortSignal) =>
  list(EventDayRecord, await read(eventId, '/admin/event-days', signal));
export const listStaffingStations = async (eventId: string, signal?: AbortSignal) =>
  list(StationSummary, await read(eventId, '/stations', signal));

export async function listStaffingPeople(eventId: string, signal?: AbortSignal) {
  const people: z.output<typeof VolunteerAdminRecord>[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ active: 'true', sort: 'name', limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const response = z
      .object({
        data: z.array(VolunteerAdminRecord),
        meta: z.object({ nextCursor: z.string().nullable() }),
      })
      .parse(await read(eventId, `/admin/volunteers?${query}`, signal));
    signal?.throwIfAborted();
    people.push(...response.data);
    cursor = response.meta.nextCursor;
  } while (cursor);
  return people;
}
export const listStationAssignments = async (
  eventId: string,
  stationId: string,
  signal?: AbortSignal,
) =>
  list(
    ShiftAssignmentRecord,
    await read(eventId, `/roster/station/${encodeURIComponent(stationId)}`, signal),
  );
export const assignVolunteer = (eventId: string, body: CreateAssignmentRequest) =>
  eventApi(eventId, '/admin/assignments', { method: 'POST', body });
export const unassignVolunteer = (eventId: string, id: string) =>
  eventApi(eventId, `/admin/assignments/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const updateEscalation = (
  eventId: string,
  input: { id: string; body: UpdateVolunteerRequest },
) =>
  eventApi(eventId, `/admin/volunteers/${encodeURIComponent(input.id)}`, {
    method: 'PATCH',
    body: input.body,
  });
export const listMySwaps = async (eventId: string, signal?: AbortSignal) =>
  list(SwapRequestRecord, await read(eventId, '/roster/swaps', signal));
export const listSwapTargets = async (eventId: string, signal?: AbortSignal) =>
  list(SwapTargetRecord, await read(eventId, '/roster/swap-targets', signal));
export const listStaffingPendingSwaps = async (eventId: string, signal?: AbortSignal) =>
  list(SwapRequestRecord, await read(eventId, '/roster/swaps/pending', signal));
export const requestSwap = (eventId: string, body: CreateSwapRequest) =>
  eventApi(eventId, '/roster/swaps', { method: 'POST', body });
export const withdrawSwap = (eventId: string, input: { id: string; idempotencyKey: string }) =>
  eventApi(eventId, `/roster/swaps/${encodeURIComponent(input.id)}/withdraw`, {
    method: 'POST',
    body: { idempotencyKey: input.idempotencyKey },
  });
export const reviewSwap = (eventId: string, input: { id: string; body: DecideSwapRequest }) =>
  eventApi(eventId, `/roster/swaps/${encodeURIComponent(input.id)}/decide`, {
    method: 'POST',
    body: input.body,
  });
export const listBriefings = async (eventId: string, eventDayId: string, signal?: AbortSignal) =>
  list(
    BriefingSlotRecord,
    await read(eventId, `/roster/briefing-slots?${new URLSearchParams({ eventDayId })}`, signal),
  );
export const scheduleBriefing = (eventId: string, body: CreateBriefingSlotRequest) =>
  eventApi(eventId, '/roster/briefing-slots', { method: 'POST', body });
export const completeBriefing = (
  eventId: string,
  input: { id: string; notes?: string; idempotencyKey?: string },
) =>
  eventApi(eventId, `/roster/briefing-slots/${encodeURIComponent(input.id)}/complete`, {
    method: 'POST',
    body: { notes: input.notes, idempotencyKey: input.idempotencyKey },
  });
