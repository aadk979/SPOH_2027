import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { CardGrid } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
export function ReportTotals({ data }: { data: FullReport }): ReactNode {
  return (
    <CardGrid>
      <StatTile
        label="Registrations"
        value={data.registrations.total}
        unit="people who signed up"
        note={`${data.registrations.voided} voided and excluded`}
      />
      <StatTile
        label="Room entries"
        value={data.footfall.total}
        unit="entries, not unique visitors"
      />
      <StatTile
        label="Cards issued"
        value={data.cards.issued}
        unit="journeys, not people"
        note={`${(data.cards.completionRate * 100).toFixed(1)}% completed`}
      />
    </CardGrid>
  );
}
