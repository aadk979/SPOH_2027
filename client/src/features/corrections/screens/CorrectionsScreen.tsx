'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { ButtonLink, Callout, Stack } from '@/shared/ui';
import { VoidRecordForm } from '../components/VoidRecordForm';
import { BulkFootfallForm } from '../components/BulkFootfallForm';

export default function CorrectionsScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  if (!session) return null;
  return (
    <AppShell title="Counting corrections" back={{ href: '/operations', label: 'Operations' }}>
      <Stack>
        {allows('Record.Void') ? <VoidRecordForm /> : null}
        {allows('Count.Adjust') ? <BulkFootfallForm /> : null}
        {!allows('Record.Void') && !allows('Count.Adjust') ? (
          <Callout>Counting corrections are available to authorised event leaders.</Callout>
        ) : null}
        {allows('Card.Void') || allows('Card.Reissue') ? (
          <ButtonLink href="/admin/cards">Correct or reissue a mission card</ButtonLink>
        ) : null}
        {allows('Audit.Read') ? (
          <ButtonLink href="/admin/audit" variant="quiet">
            Find a record in the audit trail
          </ButtonLink>
        ) : null}
      </Stack>
    </AppShell>
  );
}
