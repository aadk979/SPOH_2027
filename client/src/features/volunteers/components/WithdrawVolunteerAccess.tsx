import { type ReactNode } from 'react';
import { type VolunteerAdminRecord } from '@spoh/shared';

import { Button, CardTitle, Field, Input } from '@/shared/ui';

import type { VolunteerEditorState } from '../hooks/useVolunteerEditor';
export function WithdrawVolunteerAccess({
  volunteer,
  form,
}: {
  volunteer: VolunteerAdminRecord;
  form: VolunteerEditorState;
}): ReactNode {
  const { pending, reason, setReason, deactivate } = form;
  return (
    <>
      {volunteer.active ? (
        <div className="flex flex-col gap-sm border-t border-line pt-sm">
          <CardTitle as="h4">Withdraw access</CardTitle>
          <p className="text-caption text-text-muted">
            Signs out every device they are signed in on, stops alerts reaching their phone, and
            disables the account at sign-in. Their captured records are kept.
          </p>

          <Field
            id={`reason-${volunteer.id}`}
            label="Reason"
            hint="Shown on the roster, so the next person to look knows why."
          >
            {(props) => (
              <Input
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Lost their phone / left the committee"
              />
            )}
          </Field>

          <Button
            variant="danger"
            size="sm"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              deactivate.mutate({
                id: volunteer.id,
                body: { reason: reason.trim(), disableIdentity: true },
              })
            }
          >
            {deactivate.isPending ? 'Withdrawing…' : `Deactivate ${volunteer.displayName}`}
          </Button>
        </div>
      ) : null}
    </>
  );
}
