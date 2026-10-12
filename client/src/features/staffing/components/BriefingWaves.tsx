import { Stack, ErrorState } from '@/shared/ui';
import { listBriefings } from '../api';
import { useStaffingRead } from '../queries';
import { BriefingCard } from './BriefingCard';

export function BriefingWaves({ dayId, canComplete }: { dayId: string; canComplete: boolean }) {
  const slots = useStaffingRead(
    `briefings:${dayId}`,
    (eventId, signal) => listBriefings(eventId, dayId, signal),
    true,
  );
  if (slots.isError)
    return (
      <ErrorState error={slots.error} />
    );
  if (!slots.data) return <p>Loading briefing waves…</p>;
  if (!slots.data.length) return <p>No briefing waves scheduled for this day.</p>;
  return (
    <Stack>
      {slots.data.map((slot) => (
        <BriefingCard key={slot.id} slot={slot} canComplete={canComplete} />
      ))}
    </Stack>
  );
}
