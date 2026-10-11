'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Callout, Section, Stack, ButtonLink } from '@/shared/ui';
import { CardBatchForm } from '../components/CardBatchForm';
import { CardLookup } from '../components/CardLookup';
import { CardPrintHistory } from '../components/CardPrintHistory';
import { useEventId } from '@/shared/lib/eventContext';
export default function CardAdminScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const eventId = useEventId();
  if (!session) return null;
  return (
    <AppShell title="Mission cards" back={{ href: '/setup', label: 'Setup' }}>
      <Stack>
        <Callout>
          A card records one journey. Its count is separate from registrations and room entries.
        </Callout>
        <ButtonLink href="/admin/stations" variant="quiet">
          Choose the stations that stamp cards
        </ButtonLink>
        {allows('Card.GenerateBatch') ? (
          <Section title="Generate and print">
            <CardBatchForm key={`${eventId}:${session.volunteerId}`} />
          </Section>
        ) : null}
        {allows('Report.Export') ? (
          <Section title="Previous print exports">
            <CardPrintHistory key={`${eventId}:${session.volunteerId}`} />
          </Section>
        ) : null}
        {allows('Self.Read') ? (
          <Section title="Look up or correct a card">
            <CardLookup key={`${eventId}:${session.volunteerId}`} />
          </Section>
        ) : null}
      </Stack>
    </AppShell>
  );
}
