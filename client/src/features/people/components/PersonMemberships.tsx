import type { ReactNode } from 'react';
import type { PersonDetailResponse } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { roleLabel } from '@/features/volunteers';
import { Card, Section } from '@/shared/ui';

export function PersonMemberships({
  memberships,
}: {
  memberships: PersonDetailResponse['memberships'];
}): ReactNode {
  const time = useEventTime();
  return (
    <Section title="Memberships across events" description="Times use the event currently open.">
      {memberships.map((membership) => (
        <Card key={membership.id} variant="flat">
          <h2 className="font-semibold">{membership.eventName}</h2>
          <p>
            {roleLabel(membership.role)} · {membership.status}
          </p>
          <p className="text-caption">
            Accepted: {time.dateTime(membership.acceptedAt)} · Last seen:{' '}
            {time.dateTime(membership.lastSeenAt)}
          </p>
        </Card>
      ))}
    </Section>
  );
}
