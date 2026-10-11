import {
  collection,
  CreateStationRequest,
  UpdateStationRequest,
  StationSummary,
  CreateEventDayRequest,
  UpdateEventDayRequest,
  EventDayRecord,
  StructureResponse,
  CreateStationTypeRequest,
  UpdateStationTypeRequest,
  CreateStationTagRequest,
  UpdateStationTagRequest,
  CreateCaptureCategoryRequest,
  UpdateCaptureCategoryRequest,
  CreateManagedTemplateRequest,
  UpdateManagedTemplateRequest,
  UpdateShiftExceptionRequest,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import { RemoveEventDayRequest } from '@spoh/shared';
export function removeDay(eventId: string, input: { id: string; body: RemoveEventDayRequest }) {
  return eventApi(eventId, `/admin/structure/days/${encodeURIComponent(input.id)}`, {
    method: 'DELETE',
    body: RemoveEventDayRequest.parse(input.body),
  });
}

export type StructureWrite = {
  kind: 'type' | 'tag' | 'category' | 'template' | 'shift';
  id?: string;
  body: unknown;
};
const StationList = collection(StationSummary);
export async function getStructure(eventId: string, signal?: AbortSignal) {
  const response = StructureResponse.parse(
    await eventApi(eventId, '/admin/structure', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),
  );
  if (response.data.eventId !== eventId) throw new Error('Structure belongs to another event.');
  return response.data;
}
export async function getAdminStations(eventId: string, signal?: AbortSignal) {
  return StationList.parse(
    await eventApi(eventId, '/admin/stations', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),
  ).data;
}
const REQUESTS = {
  type: {
    path: '/admin/structure/types',
    create: CreateStationTypeRequest,
    update: UpdateStationTypeRequest,
  },
  tag: {
    path: '/admin/structure/tags',
    create: CreateStationTagRequest,
    update: UpdateStationTagRequest,
  },
  category: {
    path: '/admin/structure/categories',
    create: CreateCaptureCategoryRequest,
    update: UpdateCaptureCategoryRequest,
  },
  template: {
    path: '/admin/structure/templates',
    create: CreateManagedTemplateRequest,
    update: UpdateManagedTemplateRequest,
  },
} as const;
function structureRequest(input: StructureWrite) {
  if (input.kind === 'shift') {
    if (!input.id) throw new Error('Choose a shift to change.');
    return { path: '/admin/structure/shifts', body: UpdateShiftExceptionRequest.parse(input.body) };
  }
  const request = REQUESTS[input.kind];
  return {
    path: request.path,
    body: (input.id ? request.update : request.create).parse(input.body),
  };
}
export function saveStructure(eventId: string, input: StructureWrite) {
  const request = structureRequest(input);
  const path = input.id ? `${request.path}/${encodeURIComponent(input.id)}` : request.path;
  return eventApi(eventId, path, { method: input.id ? 'PATCH' : 'POST', body: request.body });
}
export async function saveStation(eventId: string, input: { id?: string; body: unknown }) {
  const body = (input.id ? UpdateStationRequest : CreateStationRequest).parse(input.body);
  const path = input.id ? `/admin/stations/${encodeURIComponent(input.id)}` : '/admin/stations';
  const result = await eventApi<{ station: unknown }>(eventId, path, {
    method: input.id ? 'PATCH' : 'POST',
    body,
  });
  return StationSummary.parse(result.station);
}
export async function saveDay(eventId: string, input: { id?: string; body: unknown }) {
  const body = (input.id ? UpdateEventDayRequest : CreateEventDayRequest).parse(input.body);
  const path = input.id ? `/admin/event-days/${encodeURIComponent(input.id)}` : '/admin/event-days';
  const result = await eventApi<{ eventDay: unknown }>(eventId, path, {
    method: input.id ? 'PATCH' : 'POST',
    body,
  });
  return EventDayRecord.parse(result.eventDay);
}
