import type { IncidentRecord } from '@spoh/shared';
import { useAllows, useEventTime } from '@/features/session';
import { Card, CardTitle, Stack } from '@/shared/ui';
import { IncidentFollowUpForm } from './IncidentFollowUpForm';
import { IncidentStatusForm } from './IncidentStatusForm';

export function IncidentRecordCard({ incident }: { incident: IncidentRecord }) {
  const allows = useAllows();
  const time = useEventTime();
  return (
    <Card>
      <Stack>
        <CardTitle>
          {incident.type} · {incident.severity} · {incident.status}
        </CardTitle>
        <p>
          {incident.rehearsal ? 'Practice · ' : ''}
          {time.dateTime(incident.occurredAt)} ·{' '}
          {incident.stationName ?? incident.locationNote ?? 'Event floor'}
        </p>
        <p>{incident.description}</p>
        <p className="text-caption">Reported by {incident.reportedByName}</p>
        {incident.followUps.map((followUp) => (
          <p key={followUp.id}>
            {time.dateTime(followUp.createdAt)} · {followUp.authorName}: {followUp.note}
          </p>
        ))}
        {allows('Incident.Update') ? (
          <>
            <IncidentFollowUpForm id={incident.id} />
            <IncidentStatusForm key={`${incident.id}:${incident.status}`} incident={incident} />
          </>
        ) : null}
      </Stack>
    </Card>
  );
}
