import { useState } from 'react';
import type { EventAdministrationResponse } from '@spoh/shared';
import { Button, Callout, Field, LoadingRows, Select, Stack, StatusText } from '@/shared/ui';
import { useEventAdministration } from '../queries';
import { CloneEventWizard } from './CloneEventWizard';
import { CreateEventWizard } from './CreateEventWizard';

type Management = EventAdministrationResponse;
export function ManageEvents() {
  const query = useEventAdministration();
  if (query.isError) return <Callout tone="alert">Event management could not be loaded.</Callout>;
  if (!query.data) return <LoadingRows />;
  const allowed = query.data.organisations.filter((item) => item.canCreate || item.canClone);
  if (!allowed.length) return null;
  return <ManagementContents data={{ ...query.data, organisations: allowed }} />;
}

function ManagementContents({ data }: { data: Management }) {
  const [organisationId, setOrganisationId] = useState(data.organisations[0]?.id ?? '');
  const [choice, setChoice] = useState<
    { kind: 'create' } | { kind: 'clone'; sourceId: string } | null
  >(null);
  const organisation = data.organisations.find((item) => item.id === organisationId);
  const events = data.events.filter((item) => item.organisationId === organisationId);
  return (
    <Stack>
      <h2 className="text-title">Manage events</h2>
      <Field id="event-organisation" label="Organisation">
        {(props) => (
          <Select
            {...props}
            value={organisationId}
            onChange={(event) => {
              setOrganisationId(event.target.value);
              setChoice(null);
            }}
          >
            {data.organisations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {organisation?.canCreate ? (
        <Button variant="secondary" onClick={() => setChoice({ kind: 'create' })}>
          Create new event
        </Button>
      ) : null}
      <SelectedWizard choice={choice} organisation={organisation} events={events} />
      <CloneSources
        events={events}
        canClone={organisation?.canClone === true}
        select={(sourceId) => setChoice({ kind: 'clone', sourceId })}
      />
    </Stack>
  );
}

type Choice = { kind: 'create' } | { kind: 'clone'; sourceId: string } | null;
function SelectedWizard({
  choice,
  organisation,
  events,
}: {
  choice: Choice;
  organisation: Management['organisations'][number] | undefined;
  events: Management['events'];
}) {
  if (!organisation || !choice) return null;
  if (choice.kind === 'create')
    return organisation.canCreate ? (
      <CreateEventWizard key={organisation.id} organisation={organisation} />
    ) : null;
  const source = events.find((item) => item.id === choice.sourceId);
  return source && organisation.canClone ? (
    <CloneEventWizard key={source.id} source={source} />
  ) : null;
}

function CloneSources({
  events,
  canClone,
  select,
}: {
  events: Management['events'];
  canClone: boolean;
  select: (sourceId: string) => void;
}) {
  return (
    <Stack>
      <h3 className="font-semibold">Clone sources</h3>
      <p>Archived events stay here as sources for next year.</p>
      {events.map((event) => (
        <div
          key={event.id}
          className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-line p-md"
        >
          <span>
            {event.name} <StatusText tone="neutral">{event.status.toLowerCase()}</StatusText>
          </span>
          {canClone ? (
            <Button variant="secondary" onClick={() => select(event.id)}>
              Clone {event.name}
            </Button>
          ) : null}
        </div>
      ))}
      {events.length === 0 ? (
        <Callout>No events have been created in this organisation.</Callout>
      ) : null}
    </Stack>
  );
}
