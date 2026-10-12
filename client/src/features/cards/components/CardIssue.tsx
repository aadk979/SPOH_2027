'use client';
import type { MissionCardRecord } from '@spoh/shared';
import { useState } from 'react';
import { useAllows } from '@/features/session';
import { Button, ConfirmationDialog, MutationFeedback } from '@/shared/ui';
import { useIssueCard } from '../queries';
export function CardIssue({
  card,
  onIssued,
}: {
  card: MissionCardRecord;
  onIssued(card: MissionCardRecord): void;
}) {
  const allows = useAllows();
  const issue = useIssueCard(card.shortCode, onIssued);
  const [reviewed, setReviewed] = useState<MissionCardRecord | null>(null);
  if (!allows('Registration.Create') || card.status !== 'UNISSUED') return null;
  return (
    <div>
      <p>
        Issue this fresh card only when you hand the physical card to a visitor. One card records
        one journey.
      </p>
      <Button
        disabled={issue.isPending}
        onClick={() => setReviewed(card)}
      >
        Issue this card
      </Button>
      <ConfirmationDialog open={!!reviewed} title={`Issue card ${reviewed?.shortCode ?? ''}`} confirmLabel="Confirm physical handover" pending={issue.isPending}
        onCancel={() => setReviewed(null)} onConfirm={() => {
          if (reviewed?.shortCode !== card.shortCode || !allows('Registration.Create')) return setReviewed(null);
          issue.mutate(undefined, { onSuccess: () => setReviewed(null) });
        }}>
        <p>Hand this exact physical card to the visitor. This starts one journey.</p>
        <MutationFeedback error={issue.error} operation="Issuing this card" />
      </ConfirmationDialog>
      <MutationFeedback error={issue.error} pending={issue.isPending} saved={issue.isSuccess} operation="Issuing this card" success="Physical card handover confirmed." />
    </div>
  );
}
