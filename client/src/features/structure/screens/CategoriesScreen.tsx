'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { CategorySchedulesPanel } from '@/features/taxonomy';
import { AppShell } from '@/shared/shell/AppShell';
import { Stack } from '@/shared/ui';
import { useEventId } from '@/shared/lib/eventContext';
import { useStructure } from '../queries';
import { CategoryEditor } from '../components/CategoryEditor';
import { StructureCollection } from '../components/StructureCollection';
import { StructureFeedback } from '../components/StructureFeedback';
import { StructureReadBoundary, useStructureReadFailure } from './StructureReadBoundary';
export default function CategoriesScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const eventId = useEventId();
  if (!session) return null;
  return (
    <AppShell title="Visitor categories" width="wide">
      <StructureReadBoundary
        key={`${eventId}:${session.volunteerId}`}
        readable={allows('Structure.Read')}
      >
        {(onAccessLost) => (
          <CategoriesReader
            create={allows('Structure.Change')}
            edit={allows('Structure.Edit')}
            onAccessLost={onAccessLost}
          />
        )}
      </StructureReadBoundary>
      <CategorySchedulesPanel enabled={allows('Settings.Read')} />
    </AppShell>
  );
}

function CategoriesReader({
  create,
  edit,
  onAccessLost,
}: {
  create: boolean;
  edit: boolean;
  onAccessLost: () => void;
}) {
  const structure = useStructure();
  const denied = useStructureReadFailure([structure.error], onAccessLost);
  if (denied) return null;
  return (
    <Stack>
      <StructureFeedback
        pending={structure.isPending}
        error={structure.error}
        reload={() => void structure.refetch()}
      />
      {structure.data && !structure.isError ? (
        <StructureCollection
          title="Visitor categories"
          description="These labels and this order are shown at registration. Deactivating removes a capture choice while retaining all previous counts."
          rows={structure.data.categories.map((row) => ({
            id: row.id,
            label: row.label,
            detail: `${row.code} · order ${row.sortOrder} · ${row.active ? 'active' : 'inactive'}`,
          }))}
          create={create ? <CategoryEditor /> : undefined}
          edit={(id) => (
            <CategoryEditor
              record={structure.data?.categories.find((row) => row.id === id)}
              editable={edit}
            />
          )}
        />
      ) : null}
    </Stack>
  );
}
