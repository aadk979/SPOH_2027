import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
export function CardSection({ data }: { data: FullReport }): ReactNode {
  return (
    <Section
      title="Mission Card funnel"
      description="Issued and completed do not have to match: a card issued on one day may be completed on another, because visitors keep their card and return."
    >
      <BarList>
        {data.cards.byStation.length === 0 ? (
          <p className="text-text-muted">Nothing recorded.</p>
        ) : (
          data.cards.byStation.map((row) => (
            <BarRow
              key={row.stationId}
              label={row.stationName}
              value={row.cards}
              max={Math.max(1, data.cards.issued)}
            />
          ))
        )}
      </BarList>
    </Section>
  );
}
