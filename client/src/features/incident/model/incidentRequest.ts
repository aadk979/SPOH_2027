import type { IncidentSeverity, IncidentType } from '@spoh/shared';

export interface IncidentValues {
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  locationNote: string;
}

/** The request before schema validation; a blank location note is omitted. */
export function toIncidentRequest(values: IncidentValues, stationId: string | undefined) {
  const clientRecordedAt = new Date().toISOString();
  return {
    type: values.type,
    severity: values.severity,
    ...(stationId ? { stationId } : {}),
    ...(values.locationNote.trim() ? { locationNote: values.locationNote.trim() } : {}),
    description: values.description.trim(),
    occurredAt: clientRecordedAt,
    clientRecordedAt,
    idempotencyKey: crypto.randomUUID(),
  };
}
