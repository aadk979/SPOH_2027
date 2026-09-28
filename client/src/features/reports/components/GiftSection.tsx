import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
export function GiftSection({ data }: { data: FullReport }): ReactNode {
  return (
    <Section title="Gifts">
      <BarList>
        {data.gifts.byGiftType.length === 0 ? (
          <p className="text-text-muted">Nothing recorded.</p>
        ) : (
          data.gifts.byGiftType.map((row) => (
            <BarRow
              key={row.giftTypeId}
              label={row.giftTypeName}
              value={row.redeemed}
              max={Math.max(1, ...data.gifts.byGiftType.map((entry) => entry.redeemed))}
            />
          ))
        )}
      </BarList>
    </Section>
  );
}
