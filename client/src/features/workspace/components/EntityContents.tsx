import type { EntityResponse } from '@spoh/shared';
import { Card, Callout, Section, Stack } from '@/shared/ui';
import { WorkspaceFields } from './WorkspaceFields';
import { WorkspaceLinks } from './WorkspaceLinks';
import { EntityCorrections } from './EntityCorrections';
import { useEventTime } from '@/features/session';

export function EntityContents({ entity }: { entity: EntityResponse }) {
  const time = useEventTime();
  return <Stack>
    <Card><h2 className="mb-md text-tagline font-semibold">{entity.title}</h2><WorkspaceFields fields={entity.fields} /></Card>
    <p className="text-caption text-text-muted">Observed at <time dateTime={entity.asOf}>{time.dateTime(entity.asOf)}</time></p>
    {entity.facets.length ? <Section title="Available detail"><ul className="flex flex-col gap-sm">
      {entity.facets.map((facet) => <li key={facet.name}>
        <Callout tone={facet.availability === 'available' ? 'ok' : 'neutral'} title={facet.name}>
          {facet.explanation ?? (facet.availability === 'available' ? 'Available with your current access.' :
            facet.availability === 'denied' ? 'Your current access does not include this detail.' : 'This detail is unavailable.')}
        </Callout>
      </li>)}
    </ul></Section> : null}
    <WorkspaceLinks links={entity.actions} label="Available actions" />
    <EntityCorrections entity={entity} />
    <WorkspaceLinks links={entity.related} label="Related records" />
  </Stack>;
}
