import type { ReactNode } from 'react';
import type { VolunteerAdminRecord } from '@spoh/shared';
import { useAllows, useEventTime } from '@/features/session';
import { ButtonLink } from '@/shared/ui';
import { roleLabel } from '../model/roles';
export function VolunteerIdentity({
  volunteer,
  isSelf,
}: {
  volunteer: VolunteerAdminRecord;
  isSelf: boolean;
}): ReactNode {
  const time = useEventTime();
  const allows = useAllows();
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold">
        {volunteer.displayName}
        {isSelf ? <span className="ml-xs text-caption text-text-muted">(you)</span> : null}
      </p>
      <p className="truncate text-caption text-text-muted">
        {volunteer.email} · {roleLabel(volunteer.role)}
        {volunteer.portfolio ? ` · ${volunteer.portfolio}` : ''}
      </p>
      <p className="text-caption text-text-muted">
        Last seen:{' '}
        {volunteer.lastSeenAt ? time.dateTime(volunteer.lastSeenAt) : 'Not yet signed in'}
      </p>
      {allows('Platform.ManageAdmins') ? (
        <ButtonLink
          variant="quiet"
          href={`/admin/users/person?id=${encodeURIComponent(volunteer.id)}`}
        >
          View memberships across events
        </ButtonLink>
      ) : null}
    </div>
  );
}
