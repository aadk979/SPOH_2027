import { type ReactNode } from 'react';
import { type VolunteerAdminRecord } from '@spoh/shared';

import { Callout, ErrorState } from '@/shared/ui';

import type { VolunteerEditorState } from '../hooks/useVolunteerEditor';
export function VolunteerEditorFeedback({
  volunteer,
  form,
}: {
  volunteer: VolunteerAdminRecord;
  form: VolunteerEditorState;
}): ReactNode {
  const { error, update, reactivate } = form;
  return (
    <>
      {error ? (
        <ErrorState error={error} />
      ) : null}

      {update.isSuccess ? (
        <Callout tone="ok" role="status">
          {update.data && update.data.sessionsRevoked > 0
            ? `Saved. ${update.data.sessionsRevoked} signed-in ${
                update.data.sessionsRevoked === 1 ? 'device was' : 'devices were'
              } signed out, so the new role takes effect immediately.`
            : 'Changes saved successfully.'}
        </Callout>
      ) : null}

      {reactivate.isSuccess ? (
        <Callout tone="ok" role="status">
          Access restored for {volunteer.displayName}.
        </Callout>
      ) : null}
    </>
  );
}
