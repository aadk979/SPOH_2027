import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { Section, CardGrid } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
export function SafetySection({ data }: { data: FullReport }): ReactNode {
  return (
    <Section
      title="Safety"
      description="Lost-person descriptions are deleted once a case is resolved. Only timings and outcomes are kept."
    >
      <CardGrid>
        <StatTile
          label="Incidents"
          value={data.safety.incidents.length}
          unit="reported"
          note={`${data.safety.nearMisses} near misses`}
        />
        <StatTile
          label="Lost person"
          value={data.safety.lostPerson.cases}
          unit="cases"
          note={
            data.safety.lostPerson.medianResolutionMinutes === null
              ? 'none'
              : `median ${data.safety.lostPerson.medianResolutionMinutes} min`
          }
        />
        <StatTile
          label="Lost and found"
          value={data.safety.lostAndFound.logged}
          unit="items logged"
          note={`${data.safety.lostAndFound.claimed} claimed`}
        />
      </CardGrid>
    </Section>
  );
}
