import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { CardGrid, Section } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
export function GiftStockPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  return (
    <Section title="Gift stock">
      <CardGrid columns={2}>
        {data.gifts.map((gift) => (
          <StatTile
            key={`${gift.id}:${gift.rehearsal ?? false}`}
            label={
              data.rehearsalIncluded
                ? `${gift.name} · ${gift.rehearsal ? 'practice' : 'live'}`
                : gift.name
            }
            value={gift.remaining}
            unit="remaining"
            note={`${gift.redeemed} redeemed`}
            tone={gift.outOfStock ? 'alert' : gift.lowStock ? 'warn' : 'neutral'}
          />
        ))}
      </CardGrid>
    </Section>
  );
}
