import type { AuditEntryRecord } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Card, CardTitle, Stack } from '@/shared/ui';

export function AuditEntry({ entry }: { entry: AuditEntryRecord }) {
  const time = useEventTime();
  return (
    <Card>
      <Stack>
        <CardTitle>{entry.action}</CardTitle>
        <p>
          {time.dateTime(entry.createdAt)} · {entry.actorName}
        </p>
        <p>
          {entry.entityType} · {entry.entityId ?? 'No record ID'}
        </p>
        <p className="text-caption text-text-muted">
          Audit ID: {entry.id} · request: {entry.requestId ?? 'system'}
        </p>
        <details>
          <summary>Before and after</summary>
          <div className="grid gap-sm sm:grid-cols-2">
            <pre className="overflow-auto whitespace-pre-wrap break-all">
              Before: {JSON.stringify(entry.before, null, 2)}
            </pre>
            <pre className="overflow-auto whitespace-pre-wrap break-all">
              After: {JSON.stringify(entry.after, null, 2)}
            </pre>
          </div>
        </details>
      </Stack>
    </Card>
  );
}
