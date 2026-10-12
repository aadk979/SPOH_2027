import type { RecordsAggregate, RecordsFilter, WorkspaceField } from '@spoh/shared';

const UNITS: Record<RecordsAggregate['unit'], string> = {
  registrations: 'registrations', roomEntries: 'room entries', cards: 'distinct cards', stampRows: 'stamp records',
  redemptions: 'redemptions', incidents: 'incidents', alerts: 'alerts', items: 'items',
  announcements: 'announcements', assignments: 'assignments', imports: 'imports', windows: 'fallback windows',
  stock: 'stock movements', auditRows: 'audit records', people: 'people', days: 'event days', coverageSlots: 'station / shift gaps',
};
export const aggregateLabel = (aggregate: RecordsAggregate) => `${aggregate.value.toLocaleString()} ${UNITS[aggregate.unit]}`;

export function filterDescription(filter: RecordsFilter): Array<{ label: string; value: string }> {
  return Object.entries(filter).filter(([key]) => key !== 'kind').map(([key, value]) => ({
    label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase()),
    value: typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value),
  }));
}

export function fieldValue(field: WorkspaceField): string {
  if (field.value === null) return 'Not recorded';
  if (typeof field.value === 'boolean') return field.value ? 'Yes' : 'No';
  if (typeof field.value === 'number') return field.value.toLocaleString();
  return field.value;
}
