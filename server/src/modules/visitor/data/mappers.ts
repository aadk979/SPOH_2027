import type { VisitorFieldRecord } from '@spoh/shared';
import type { FieldRow } from './repo.js';

export function toFieldRecord(row: FieldRow): VisitorFieldRecord {
  return {
    ...row,
    type: row.type as VisitorFieldRecord['type'],
    classification: row.classification as VisitorFieldRecord['classification'],
  };
}
