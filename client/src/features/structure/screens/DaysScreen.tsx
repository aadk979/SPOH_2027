'use client';
import type { StructureResponse, EventDayRecord } from '@spoh/shared';
import { useEventDays } from '@/features/eventDays';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Stack } from '@/shared/ui';
import { useEventId } from '@/shared/lib/eventContext';
import { useStructure } from '../queries';
import { StructureCollection } from '../components/StructureCollection';
import { DayEditor } from '../components/DayEditor';
import { RemoveDay } from '../components/RemoveDay';
import { TemplateEditor } from '../components/TemplateEditor';
import { ExceptionsGrid } from '../components/ExceptionsGrid';
import { StructureFeedback } from '../components/StructureFeedback';
import { StructureReadBoundary, useStructureReadFailure } from './StructureReadBoundary';
export default function DaysScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const eventId = useEventId();
  if (!session) return null;
  return (
    <AppShell title="Days, shifts and exceptions" width="wide">
      <StructureReadBoundary
        key={`${eventId}:${session.volunteerId}`}
        readable={allows('Structure.Read')}
      >
        {(onAccessLost) => (
          <DaysReader
            create={allows('Structure.Change')}
            edit={allows('Structure.Edit')}
            onAccessLost={onAccessLost}
          />
        )}
      </StructureReadBoundary>
    </AppShell>
  );
}

function DaysReader({
  create,
  edit,
  onAccessLost,
}: {
  create: boolean;
  edit: boolean;
  onAccessLost: () => void;
}) {
  const structure = useStructure();
  const days = useEventDays();
  const denied = useStructureReadFailure([structure.error, days.error], onAccessLost);
  if (denied) return null;
  return (
    <Stack>
      <StructureFeedback
        pending={structure.isPending || days.isPending}
        error={structure.error ?? days.error}
        reload={() => {
          void structure.refetch();
          void days.refetch();
        }}
      />
      {structure.data && days.data && !structure.isError && !days.isError ? (
        <DaysContents data={structure.data} days={days.data} create={create} edit={edit} />
      ) : null}
    </Stack>
  );
}

function DaysContents({
  data,
  days,
  create,
  edit,
}: {
  data: StructureResponse['data'];
  days: EventDayRecord[];
  create: boolean;
  edit: boolean;
}) {
  return (
    <>
      <StructureCollection
        title="Event days"
        description={`Dates and shift hours use ${data.timezone}. Adding a day gives it one shift per active template. Dates are stable so roster records stay attached to their original day.`}
        rows={days.map((row) => ({
          id: row.id,
          label: row.label,
          detail: `${row.date} · ${row.shifts.length} shifts · ${row.assignmentCount} assignments`,
        }))}
        create={create ? <DayEditor /> : undefined}
        edit={(id) => (
          <>
            <DayEditor record={days.find((row) => row.id === id)} editable={edit} />
            {create ? <RemoveDay day={days.find((row) => row.id === id)!} /> : null}
          </>
        )}
      />
      <StructureCollection
        title="Shift templates"
        description="Create an event-wide shift pattern; change individual days in the exceptions grid below."
        rows={data.templates.map((row) => ({
          id: row.id,
          label: row.label,
          detail: `${row.code} · ${row.startLocal}–${row.endLocal}${row.endsNextDay ? ' (+1 day)' : ''} · ${row.active ? 'active' : 'inactive'}`,
        }))}
        create={create ? <TemplateEditor /> : undefined}
        edit={(id) => (
          <TemplateEditor record={data.templates.find((row) => row.id === id)} editable={edit} />
        )}
      />
      <ExceptionsGrid structure={data} days={days} editable={create} />
    </>
  );
}
