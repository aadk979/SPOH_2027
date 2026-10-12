import type { EventDayRecord } from '@spoh/shared';
import { useMe } from '@/features/session';
import { ErrorState } from '@/shared/ui';
import { listStaffingPeople } from '../api';
import { useStaffingRead } from '../queries';
import { BriefingScheduleForm } from './BriefingScheduleForm';

export function BriefingScheduler({ day }: { day: EventDayRecord }) {
  const me = useMe();
  const people = useStaffingRead('people', listStaffingPeople, true);
  if (people.isError)
    return (
      <ErrorState error={people.error} />
    );
  if (!people.data || !me.data) return <p>Loading briefers…</p>;
  return (
    <BriefingScheduleForm
      key={day.id}
      day={day}
      people={people.data}
      timezone={me.data.event.timezone}
    />
  );
}
