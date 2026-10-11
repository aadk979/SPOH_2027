'use client';
import type { StructureResponse, StationSummary } from '@spoh/shared';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Stack } from '@/shared/ui';
import { useEventId } from '@/shared/lib/eventContext';
import { useAdminStations, useStructure } from '../queries';
import { StructureCollection } from '../components/StructureCollection';
import { StationEditor } from '../components/StationEditor';
import { StationTypeEditor } from '../components/StationTypeEditor';
import { StationTagEditor } from '../components/StationTagEditor';
import { StructureFeedback } from '../components/StructureFeedback';
import { StructureReadBoundary, useStructureReadFailure } from './StructureReadBoundary';
export default function StationsScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const eventId = useEventId();
  if (!session) return null;
  return (
    <AppShell title="Stations, types and tags" width="wide">
      <StructureReadBoundary
        key={`${eventId}:${session.volunteerId}`}
        readable={allows('Structure.Read')}
      >
        {(onAccessLost) => (
          <StationsReader
            create={allows('Structure.Change')}
            edit={allows('Structure.Edit')}
            onAccessLost={onAccessLost}
          />
        )}
      </StructureReadBoundary>
    </AppShell>
  );
}

function StationsReader({
  create,
  edit,
  onAccessLost,
}: {
  create: boolean;
  edit: boolean;
  onAccessLost: () => void;
}) {
  const structure = useStructure();
  const stations = useAdminStations();
  const denied = useStructureReadFailure([structure.error, stations.error], onAccessLost);
  if (denied) return null;
  return (
    <Stack>
      <StructureFeedback
        pending={structure.isPending || stations.isPending}
        error={structure.error ?? stations.error}
        reload={() => {
          void structure.refetch();
          void stations.refetch();
        }}
      />
      {structure.data && stations.data && !structure.isError && !stations.isError ? (
        <StationsContents
          data={structure.data}
          stations={stations.data}
          create={create}
          edit={edit}
        />
      ) : null}
    </Stack>
  );
}

function StationsContents({
  data,
  stations,
  create,
  edit,
}: {
  data: StructureResponse['data'];
  stations: StationSummary[];
  create: boolean;
  edit: boolean;
}) {
  return (
    <>
      <StructureCollection
        title="Stations"
        description="Configure locations and the capabilities visitors use there. Deactivate a station to remove it from capture choices; historical records keep its identity."
        rows={stations.map((row) => ({
          id: row.id,
          label: row.name,
          detail: `${row.code} · ${row.type.label} · ${row.active ? 'active' : 'inactive'}`,
        }))}
        create={create ? <StationEditor structure={data} /> : undefined}
        edit={(id) => (
          <StationEditor
            record={stations.find((row) => row.id === id)}
            structure={data!}
            editable={edit}
          />
        )}
      />
      <StructureCollection
        title="Station types"
        description="Capabilities belong to the type. Editing them affects every station of that type. Stable codes and retired records remain available for historical reports."
        rows={data.stationTypes.map((row) => ({
          id: row.id,
          label: row.label,
          detail: `${row.code} · ${row.active ? 'active' : 'inactive'}`,
        }))}
        create={create ? <StationTypeEditor /> : undefined}
        edit={(id) => (
          <StationTypeEditor
            record={data.stationTypes.find((row) => row.id === id)}
            editable={edit}
          />
        )}
      />
      <StructureCollection
        title="Station tags"
        description="Group stations by course, location or any label useful to this event. Inactive tags keep their historical links."
        rows={data.stationTags.map((row) => ({
          id: row.id,
          label: row.label,
          detail: `${row.code} · ${row.active ? 'active' : 'inactive'}`,
        }))}
        create={create ? <StationTagEditor /> : undefined}
        edit={(id) => (
          <StationTagEditor
            record={data.stationTags.find((row) => row.id === id)}
            editable={edit}
          />
        )}
      />
    </>
  );
}
