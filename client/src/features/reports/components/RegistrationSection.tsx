import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
import { readableCategory } from '@/shared/lib/format';
export function RegistrationSection({ data }: { data: FullReport }): ReactNode {
  return (
    <Section title="Who came">
      <BarList>
        {data.registrations.byCategory.length === 0 ? (
          <p className="text-text-muted">Nothing recorded.</p>
        ) : (
          data.registrations.byCategory.map((row) => (
            <BarRow
              key={row.key}
              label={readableCategory(row.key)}
              value={row.value}
              max={Math.max(1, ...data.registrations.byCategory.map((entry) => entry.value))}
            />
          ))
        )}
      </BarList>
    </Section>
  );
}
