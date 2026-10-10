import type {
  ProvisionVolunteerRequest,
  ProvisionVolunteerResponse,
  RosterImportRequest,
  RosterImportResponse,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export function invitePerson(
  eventId: string,
  body: ProvisionVolunteerRequest,
): Promise<ProvisionVolunteerResponse> {
  return eventApi(eventId, '/roster/volunteers', { method: 'POST', body });
}

export function importPeople(
  eventId: string,
  body: RosterImportRequest,
): Promise<RosterImportResponse> {
  return eventApi(eventId, '/roster/import', { method: 'POST', body });
}
