import type { MissionCardRecord } from '@spoh/shared';
import { useAllows } from '@/features/session';
import { Button, Callout } from '@/shared/ui';
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
  if (!allows('Registration.Create') || card.status !== 'UNISSUED') return null;
  return (
    <div>
      <p>
        Issue this fresh card only when you hand the physical card to a visitor. One card records
        one journey.
      </p>
      <Button
        disabled={issue.isPending}
        onClick={() => {
          if (window.confirm(`Hand card ${card.shortCode} to the visitor?`)) issue.mutate();
        }}
      >
        Issue this card
      </Button>
      {issue.error ? <Callout role="alert">{issue.error.message}</Callout> : null}
    </div>
  );
}
