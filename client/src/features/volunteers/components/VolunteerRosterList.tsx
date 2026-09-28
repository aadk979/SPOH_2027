import type { ReactNode } from 'react';
import type { MeResponse } from '@spoh/shared';
import { EmptyState, LoadingRows, Section } from '@/shared/ui';
import type { VolunteerRoster } from '../hooks/useVolunteerRoster';
import { VolunteerRow } from './VolunteerRow';
export function VolunteerRosterList({
  roster,
  me,
  canManage,
}: {
  roster: VolunteerRoster;
  me: MeResponse | undefined;
  canManage: boolean;
}): ReactNode {
  const { volunteers, editing, setEditing } = roster;
  const rows = volunteers.data?.data ?? [];
  return (
    <Section
      // No count while the count is unknown. A heading reading "0
      // volunteers" during the first load says the roster is empty, which
      // is the one thing an admin opening this screen must not be told.
      title={
        volunteers.isPending
          ? 'Roster'
          : `${rows.length} ${rows.length === 1 ? 'volunteer' : 'volunteers'}`
      }
      description="A name that has never signed in is a volunteer who cannot capture anything on the day."
    >
      {volunteers.isPending ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody matches that">
          Clear the search, or widen the role filter.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-xs">
          {rows.map((volunteer) => (
            <VolunteerRow
              key={volunteer.id}
              volunteer={volunteer}
              canManage={canManage}
              viewerRole={me?.volunteer.role}
              isSelf={volunteer.id === me?.volunteer.id}
              open={editing === volunteer.id}
              onToggle={() => setEditing(editing === volunteer.id ? null : volunteer.id)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
