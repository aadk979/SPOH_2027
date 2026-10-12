import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
import { registrationsLink } from '../model/drillLinks';
export function ArrivalsPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  const maxCategory = Math.max(1, ...data.registrations.byCategory.map((row) => row.value));
  return (
    <Section title="Who is arriving">
      <BarList>
        {data.registrations.byCategory.length === 0 ? (
          <p className="text-text-muted">Nothing recorded yet today.</p>
        ) : (
          data.registrations.byCategory.map((row) => (
            <BarRow key={row.key} label={row.label} value={row.value} max={maxCategory} href={registrationsLink(data.observation, { categoryCode: row.key })} />
          ))
        )}
      </BarList>
    </Section>
  );
}
