import { BriefingSlotRecord, collection, EventDayRecord, ShiftAssignmentRecord, StationSummary, StructureResponse,
  SwapRequestRecord, SwapTargetRecord, VolunteerAdminRecord } from '@spoh/shared';
import { STRUCTURE } from '../helpers/structure';
import { STAFFING_ASSIGNMENT, STAFFING_BRIEFING, STAFFING_DAY, STAFFING_SWAP } from '../helpers/staffing';
import { CAMPAIGN_PERSON, CAMPAIGN_STATION, CAMPAIGN_TARGET } from './campaignCore';
import type { CampaignResponse } from './campaignTypes';

export function campaignStructureResponses(eventId: string): CampaignResponse[] {
  const days = collection(EventDayRecord).parse({ data: [{ ...STAFFING_DAY, isTourDay: true, assignmentCount: 1 }], meta: { count: 1, nextCursor: null } });
  const stations = collection(StationSummary).parse({ data: [CAMPAIGN_STATION], meta: { count: 1, nextCursor: null } });
  const people = collection(VolunteerAdminRecord).parse({ data: [CAMPAIGN_PERSON, CAMPAIGN_TARGET], meta: { count: 2, nextCursor: null } });
  const assignment = collection(ShiftAssignmentRecord).parse({ data: [{ ...STAFFING_ASSIGNMENT, volunteerId: CAMPAIGN_PERSON.id,
    volunteerName: CAMPAIGN_PERSON.displayName }], meta: { count: 1, nextCursor: null } });
  const swap = collection(SwapRequestRecord).parse({ data: [STAFFING_SWAP], meta: { count: 1, nextCursor: null } });
  const structure = StructureResponse.parse({ data: { ...STRUCTURE, eventId, shifts: STRUCTURE.shifts.map((shift) => ({ ...shift,
    date: STAFFING_DAY.date, startsAt: STAFFING_DAY.shifts[0]!.startsAt, endsAt: STAFFING_DAY.shifts[0]!.endsAt })) } });
  return [
    { path: '/admin/structure', body: structure }, { path: '/admin/stations', body: stations }, { path: '/stations', body: stations },
    { path: '/admin/event-days', body: days },
    { path: '/admin/volunteers', query: { active: 'true', sort: 'name', limit: '100' }, body: people },
    { path: '/admin/volunteers', query: { sort: 'name', limit: '100' }, body: people },
    { path: '/roster/station/station', body: assignment },
    { path: '/roster/swaps', body: swap }, { path: '/roster/swaps/pending', body: swap },
    { path: '/roster/swap-targets', body: collection(SwapTargetRecord).parse({ data: [{ id: 'target', displayName: 'Target Person' }], meta: { count: 1, nextCursor: null } }) },
    { path: '/roster/briefing-slots', query: { eventDayId: 'day' }, body: collection(BriefingSlotRecord).parse({
      data: [STAFFING_BRIEFING], meta: { count: 1, nextCursor: null } }) },
  ];
}
