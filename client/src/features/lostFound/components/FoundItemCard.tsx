import type { ReactNode } from 'react';
import type { LostFoundRecord } from '@spoh/shared';
import { Button, Card, StatusText, type Tone } from '@/shared/ui';
import type { useClaimLostFound } from '@/features/lostFound';
import { formatDateTime } from '@/shared/lib/format';
export function FoundItemCard({
  item,
  claim,
}: {
  item: LostFoundRecord;
  claim: ReturnType<typeof useClaimLostFound>;
}): ReactNode {
  return (
    <Card as="li" className="flex flex-col">
      <p className="text-tagline font-semibold">{item.itemLabel}</p>

      <p className="text-caption text-text-muted">
        {item.categoryLabel ? `${item.categoryLabel} · ` : ''}
        Found {formatDateTime(item.foundAt)}
        {item.foundStationName ? ` at ${item.foundStationName}` : ''}
      </p>

      {item.holderNote ? (
        <p className="mt-xs text-caption">
          <strong>Where it is:</strong> {item.holderNote}
        </p>
      ) : null}

      {item.photoKey ? (
        <p className="mt-xs text-caption text-text-muted">
          <span aria-hidden="true">📷 </span>
          Photo on file
        </p>
      ) : null}

      {/* Status is a word, never carried by colour alone. */}
      <StatusText tone={statusTone(item.status)} className="mt-sm block">
        {readableStatus(item.status)}
      </StatusText>

      {item.status === 'HELD' ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-sm self-start"
          disabled={claim.isPending && claim.variables === item.id}
          onClick={() => claim.mutate(item.id)}
          // Otherwise a screen-reader user hears "Mark claimed" once per
          // card with no way to tell which item they are about to close.
          aria-label={`Mark ${item.itemLabel} claimed`}
        >
          {claim.isPending && claim.variables === item.id ? 'Claiming…' : 'Mark claimed'}
        </Button>
      ) : null}
    </Card>
  );
}
function readableStatus(status: LostFoundRecord['status']): string {
  switch (status) {
    case 'HELD':
      return 'Held';
    case 'CLAIMED':
      return 'Claimed';
    case 'UNCLAIMED_AT_CLOSE':
      return 'Unclaimed at close of event';
    case 'DISPOSED':
      return 'Disposed';
  }
}

function statusTone(status: LostFoundRecord['status']): Tone {
  return status === 'HELD' ? 'warn' : status === 'CLAIMED' ? 'ok' : 'neutral';
}
