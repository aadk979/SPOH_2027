import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
export function CardFunnelPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  const maxStage = Math.max(1, ...data.cards.stages.map((row) => row.value));
  return (
    <Section title="Mission Card funnel — cards, not people">
      <BarList>
        {data.cards.stages.map((stage) => (
          <BarRow
            key={stage.key}
            label={stage.label}
            value={stage.value}
            max={maxStage}
            suffix={stage.key === 'issued' ? '' : ` · ${Math.round(stage.rateOfIssued * 100)}%`}
          />
        ))}
      </BarList>
    </Section>
  );
}
