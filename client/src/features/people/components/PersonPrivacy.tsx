import type { ReactNode } from 'react';
import type { PersonDetailResponse } from '@spoh/shared';
import { useAllows, useCurrentSession } from '@/features/session';
import { Stack } from '@/shared/ui';
import { PersonDataExport } from './PersonDataExport';
import { PersonDataErasure } from './PersonDataErasure';
export function PersonPrivacy({ person }: { person: PersonDetailResponse['person'] }): ReactNode {
  const allows = useAllows();
  const session = useCurrentSession();
  if (!allows('Platform.ManageAdmins')) return null;
  return <details className="rounded-md border border-line p-md"><summary className="cursor-pointer font-semibold">Personal data requests</summary>
    <Stack><PersonDataExport id={person.id} />
      {person.deactivatedAt && person.id !== session?.volunteerId ? <PersonDataErasure id={person.id} /> :
        <p>Profile erasure requires the account to be withdrawn across events by another platform admin.</p>}
    </Stack>
  </details>;
}
