import type { MyAssignment } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { entityPath } from '@/shared/lib/workspacePath';
import { AppLink } from '@/shared/lib/AppLink';
import { Card, EmptyState, StatusText } from '@/shared/ui';

export function AssignmentList({ assignments, empty }: { assignments: MyAssignment[]; empty: string }) {
  const format = useEventTime();
  if (!assignments.length) return <EmptyState title={empty}>Check the roster with your IC if an assignment is missing.</EmptyState>;
  return <ul className="flex flex-col gap-xs">{assignments.map((assignment) => <Card as="li" variant="flat" key={assignment.id}>
    <AppLink href={entityPath({ kind: 'assignment', id: assignment.id })} className="font-semibold text-primary underline">{assignment.station.name}</AppLink>
    <p className="text-caption text-text-muted">{assignment.dayLabel} · {format.shiftHours(assignment.shift)} · {assignment.roleLabel}</p>
    {assignment.checkedInAt ? <StatusText tone={assignment.checkedOutAt ? 'neutral' : 'ok'} className="mt-xxs block">
      {assignment.checkedOutAt ? `Checked out ${format.time(assignment.checkedOutAt)}` : `Checked in ${format.time(assignment.checkedInAt)}`}
    </StatusText> : <StatusText tone="neutral">Not checked in</StatusText>}
  </Card>)}</ul>;
}
