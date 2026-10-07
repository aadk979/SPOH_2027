import type { ReactNode } from 'react';
import { Card, Section } from '@/shared/ui';
import { NUMERIC_FIELDS, type FieldSpec } from '../model/numericFields';
import { retiredLegacyHome } from '../model/retiredLegacyKeys';

/** Where each former threshold is changed now; none is edited or shown as live here. */
export function ThresholdsForm(): ReactNode {
  return (
    <Section
      title="Thresholds"
      description="Each of these is now changed in its own section above."
    >
      <div className="flex flex-col gap-sm">
        {NUMERIC_FIELDS.map((field) => (
          <CataloguePointer key={field.key} field={field} />
        ))}
      </div>
    </Section>
  );
}

function CataloguePointer({ field }: { field: FieldSpec }): ReactNode {
  return (
    <Card variant="flat">
      <p className="font-semibold">{field.label}</p>
      <p className="text-caption text-text-muted">{field.hint}</p>
      <p className="text-caption text-text-muted">{pointerText(field)}</p>
    </Card>
  );
}

function pointerText(field: FieldSpec): string {
  const home = retiredLegacyHome(field.key);
  if (home === 'visitorData') return 'Changed under Counts and visitor data above, for this event.';
  if (home === 'organisation')
    return 'Changed under Organisation settings above, by a platform admin, for every event.';
  const scopes = field.stationScope ? 'event or station' : 'event';
  return `Changed in the Settings catalogue above, at ${scopes} scope.`;
}
