import type {
  PersonDetailResponse,
  DeactivatePersonRequest,
  IdentityMutationResponse,
} from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { PersonDataExportResponse, type ErasePersonRequest, type ErasePersonResponse } from '@spoh/shared';

export function getPerson(id: string): Promise<PersonDetailResponse> {
  return api(`/people/${encodeURIComponent(id)}`);
}
export function deactivatePerson(input: {
  id: string;
  body: DeactivatePersonRequest;
}): Promise<IdentityMutationResponse> {
  return api(`/people/${encodeURIComponent(input.id)}/deactivate`, {
    method: 'POST',
    body: input.body,
  });
}
export function reactivatePerson(input: {
  id: string;
  idempotencyKey: string;
}): Promise<IdentityMutationResponse> {
  return api(`/people/${encodeURIComponent(input.id)}/reactivate`, {
    method: 'POST',
    body: { idempotencyKey: input.idempotencyKey },
  });
}
export async function exportPersonData(id: string) {
  return PersonDataExportResponse.parse(await api(`/people/${encodeURIComponent(id)}/data`, { cache: 'no-store' }));
}
export function erasePersonData(input: { id: string; body: ErasePersonRequest }): Promise<ErasePersonResponse> {
  return api(`/people/${encodeURIComponent(input.id)}/erase`, { method: 'POST', body: input.body });
}
