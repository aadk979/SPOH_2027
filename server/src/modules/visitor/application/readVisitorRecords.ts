import type { CommitteeRole, VisitorRecordsResponse } from '@spoh/shared';
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import { toFieldRecord } from '../data/mappers.js';
import { listFieldRows, listRecordRows } from '../data/repo.js';
import { readableBy } from '../domain/visitorRules.js';

/** The values a role may read in a window, or null when it reads no field. */
export async function visitorRecordsFor(
  scope: ReportingScope,
  reader: { role: CommitteeRole; from: Date; to: Date },
): Promise<VisitorRecordsResponse | null> {
  const fields = readableBy((await listFieldRows(scope)).map(toFieldRecord), reader.role);
  if (fields.length === 0) return null;
  const codes = new Set(fields.map((field) => field.code));
  const rows = await listRecordRows(scope, reader);
  const data = rows.flatMap((row) => {
    const stored = row.data as Record<string, string>;
    const values = Object.fromEntries(Object.entries(stored).filter(([code]) => codes.has(code)));
    if (Object.keys(values).length === 0) return [];
    return [
      {
        registrationId: row.registrationId,
        recordedAt: row.registration.recordedAt.toISOString(),
        values,
      },
    ];
  });
  return { fields, data };
}

/** As above, for the screen: a role that reads no field is refused (ADR-002 §4). */
export async function readVisitorRecords(
  scope: ReportingScope,
  reader: { role: CommitteeRole; from: Date; to: Date },
): Promise<VisitorRecordsResponse> {
  const records = await visitorRecordsFor(scope, reader);
  if (!records) throw new ForbiddenError('Your role reads no visitor field of this event.');
  return records;
}
