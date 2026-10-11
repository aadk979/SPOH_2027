'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { useCallback, useState } from 'react';
import { useEventId } from '@/shared/lib/eventContext';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, Callout, EmptyState, LoadingRows, Stack } from '@/shared/ui';
import { useAuditAccessFailure, useAuditLog } from '../queries';
import { useAuditFilters } from '../hooks/useAuditFilters';
import { AuditFilters } from '../components/AuditFilters';
import { AuditEntry } from '../components/AuditEntry';

export default function AuditScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const eventId = useEventId();
  const allowed = allows('Audit.Read');
  if (!session) return null;
  return (
    <AppShell title="Audit trail" width="wide" back={{ href: '/overview', label: 'Overview' }}>
      <Stack>
        {!allowed ? (
          <Callout>The audit trail is available to authorised organisers.</Callout>
        ) : (
          <AuditOwner key={`${eventId}:${session.volunteerId}`} />
        )}
      </Stack>
    </AppShell>
  );
}

function AuditOwner() {
  const [denied, setDenied] = useState(false);
  const onAccessLost = useCallback(() => setDenied(true), []);
  return denied ? (
    <Callout role="alert">Audit access is unavailable. Reload your session.</Callout>
  ) : (
    <AuditReader onAccessLost={onAccessLost} />
  );
}

function AuditReader({ onAccessLost }: { onAccessLost: () => void }) {
  const control = useAuditFilters();
  const log = useAuditLog(control.filters, true);
  useAuditAccessFailure(log.error, onAccessLost);
  if (log.error)
    return (
      <>
        <AuditFilters control={control} />
        <Callout tone="alert" role="alert">
          {log.error.message}
        </Callout>
      </>
    );
  return (
    <>
      <AuditFilters control={control} />
      {log.isPending ? <LoadingRows /> : null}
      {log.data?.pages
        .flatMap((page) => page.data)
        .map((entry) => (
          <AuditEntry key={entry.id} entry={entry} />
        ))}
      {log.data?.pages[0]?.data.length === 0 ? (
        <EmptyState title="No matching audit entries">
          Change the filters to see a wider range.
        </EmptyState>
      ) : null}
      {log.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          Load older entries
        </Button>
      ) : null}
    </>
  );
}
