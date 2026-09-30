import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
export function StationCategories({ board }: { board: StationDashboardResponse }): ReactNode {
  return (
    <Section title="Categories">
      <BarList>
        {board.registrations.byCategory.length === 0 ? (
          <p className="text-text-muted">Nothing recorded here today.</p>
        ) : (
          board.registrations.byCategory.map((row) => (
            <BarRow
              key={row.key}
              label={row.label}
              value={row.value}
              max={Math.max(1, ...board.registrations.byCategory.map((entry) => entry.value))}
            />
          ))
        )}
      </BarList>
    </Section>
  );
}
