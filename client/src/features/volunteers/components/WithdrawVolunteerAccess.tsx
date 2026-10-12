import { useState, type ReactNode } from 'react';
import { type DeactivateVolunteerRequest, type VolunteerAdminRecord } from '@spoh/shared';

import { Button, CardTitle, ConfirmationDialog, Field, Input, MutationFeedback } from '@/shared/ui';

import type { VolunteerEditorState } from '../hooks/useVolunteerEditor';
export function WithdrawVolunteerAccess({
  volunteer,
  form,
}: {
  volunteer: VolunteerAdminRecord;
  form: VolunteerEditorState;
}): ReactNode {
  const { pending, reason, setReason, deactivate, reviewWithdrawal } = form;
  const [review, setReview] = useState<DeactivateVolunteerRequest | null>(null);
  function confirm() {
    if (!review || pending) return;
    deactivate.mutate({ id: volunteer.id, body: review }, { onSuccess: () => setReview(null) });
  }
  return (
    <>
      {volunteer.active ? (
        <div className="flex flex-col gap-sm border-t border-line pt-sm">
          <CardTitle as="h4">Withdraw access</CardTitle>
          <p className="text-caption text-text-muted">
            Removes access and alerts for this event. Their captured records are kept. A platform
            admin can withdraw their account across all events from their person page.
          </p>

          <Field
            id={`reason-${volunteer.id}`}
            label="Reason"
            error={form.errors.reason}
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
            onClick={() => setReview(reviewWithdrawal())}
          >
            {deactivate.isPending ? 'Withdrawing…' : `Deactivate ${volunteer.displayName}`}
          </Button>
          <ConfirmationDialog open={review !== null} title={`Withdraw ${volunteer.displayName} from this event?`}
            confirmLabel="Confirm event withdrawal" pending={pending} onConfirm={confirm} onCancel={() => setReview(null)}>
            <p>This ends this person's access and alerts for this event. Their captured records and access to other events remain.</p>
            <p>Reason: {review?.reason}</p>
            <MutationFeedback error={deactivate.error} operation="Withdrawing event access" />
          </ConfirmationDialog>
        </div>
      ) : null}
    </>
  );
}
