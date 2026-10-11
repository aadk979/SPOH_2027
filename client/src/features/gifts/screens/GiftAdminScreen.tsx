'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Card, Callout, EmptyState, LoadingRows, Section, Stack } from '@/shared/ui';
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
    {gifts.isLoading ? <LoadingRows /> : null}
    {gifts.isError ? <Callout>Could not read stock. Reload to try again.</Callout> : null}
    {gifts.data?.length === 0 ? <EmptyState title="No gifts yet">Add a gift type and its opening stock.</EmptyState> : null}
    {gifts.data?.map((gift) => <Card key={gift.id}><h2>{gift.name}</h2>
      <p>{gift.remaining} remaining · {gift.redeemed} redeemed · {gift.active ? 'Active' : 'Inactive'}</p>
      {gift.lowStock ? <Callout>Low stock: arrange another delivery.</Callout> : null}
      {allows('Structure.Edit') ? <GiftTypeEditor gift={gift} /> : null}
      {allows('Count.Adjust') ? <GiftStockForm gift={gift} /> : null}
    </Card>)}
  </Stack></AppShell>;
}
