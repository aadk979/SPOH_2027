'use client';
import { useState } from 'react';
import type { ShiftAssignmentRecord } from '@spoh/shared';
import { useAllows, useEventTime } from '@/features/session';
import { Button, ConfirmationDialog, MutationFeedback, useToast } from '@/shared/ui';
import { unassignVolunteer } from '../api';
import { useStaffingWrite } from '../queries';

export function UnassignAssignment({ assignment }: { assignment: ShiftAssignmentRecord }) {
  const [review, setReview] = useState<ShiftAssignmentRecord | null>(null);
  const remove = useStaffingWrite(unassignVolunteer);
  const allows = useAllows();
  const time = useEventTime();
  const announce = useToast();
  function confirm() {
    if (!review || !allows('Roster.Edit') || review.id !== assignment.id) return;
    remove.mutate(review.id, { onSuccess: () => { setReview(null); announce('Reviewed assignment removed. Check station coverage.'); } });
  }
  return <>
    <Button size="sm" variant="secondary" disabled={remove.isPending} onClick={() => { remove.reset(); setReview({ ...assignment }); }}>
      Unassign {assignment.volunteerName}
    </Button>
    <MutationFeedback error={remove.error} pending={remove.isPending} operation="Removing assignment" />
    <ConfirmationDialog open={review !== null} title="Review assignment removal" confirmLabel="Unassign this person" pending={remove.isPending} onCancel={() => setReview(null)} onConfirm={confirm}>
      <p>{review?.volunteerName} · {review?.roleLabel}</p>
      <p>{review?.stationName} · {review?.date} · {review?.shift.label}</p>
      {review ? <p>{time.shiftHours(review.shift)}</p> : null}
      <p>This removes only this assignment. It may leave this station shift without coverage. The person's account and other shifts remain.</p>
      <MutationFeedback error={remove.error} operation="Removing assignment" onRetry={confirm} />
    </ConfirmationDialog>
  </>;
}
