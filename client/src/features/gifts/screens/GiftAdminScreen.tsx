'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Card, Callout, CountHelp, EmptyState, LoadingRows, Section, Stack, ErrorState } from '@/shared/ui';
import { CreateGiftForm } from '../components/CreateGiftForm';
import { GiftTypeEditor } from '../components/GiftTypeEditor';
import { GiftStockForm } from '../components/GiftStockForm';
import { useGiftCatalogue } from '../queries';
export default function GiftAdminScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const gifts = useGiftCatalogue(!!session && allows('Settings.Read'));
  if (!session) return null;
  return <AppShell title="Gifts and stock" back={{ href: '/setup', label: 'Setup' }}><Stack>
    <Callout>Stock shown is for the event's current live or rehearsal mode. Opening stock stays fixed; adjustments explain later changes.</Callout>
    {allows('Structure.Change') ? <Section title="Add a gift"><CreateGiftForm /></Section> : null}
    <GiftCatalogue gifts={gifts} />
    <CountHelp topic="stock" />
  </Stack></AppShell>;
}

function GiftCatalogue({ gifts }: { gifts: ReturnType<typeof useGiftCatalogue> }) {
  const allows = useAllows();
  if (gifts.isError) return <ErrorState error={gifts.error} operation="Loading gift stock" onRetry={() => void gifts.refetch()} />;
  if (gifts.isLoading) return <LoadingRows />;
  if (gifts.data?.length === 0) return <EmptyState title="No gifts yet">Add a gift type and its opening stock.</EmptyState>;
  return <>{gifts.data?.map((gift) => <Card key={gift.id}><h2>{gift.name}</h2>
      <p>{gift.remaining} remaining · {gift.redeemed} redeemed · {gift.active ? 'Active' : 'Inactive'}</p>
      {gift.lowStock ? <Callout>Low stock: arrange another delivery.</Callout> : null}
      {allows('Structure.Edit') ? <GiftTypeEditor gift={gift} /> : null}
      {allows('Count.Adjust') ? <GiftStockForm gift={gift} /> : null}
    </Card>)}</>;
}
