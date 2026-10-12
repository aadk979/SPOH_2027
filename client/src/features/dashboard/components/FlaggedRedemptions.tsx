import type { ReactNode } from 'react';
import type { FlaggedRedemption } from '@spoh/shared';
import { Callout } from '@/shared/ui';
import { flaggedRedemptionText } from '../model/attentionProblems';
import { entityPath } from '@/shared/lib/workspacePath';
import { AppLink } from '@/shared/lib/AppLink';

/** Gifts recorded from a phone's offline queue that broke a rule on sync (F03-034). */
export function FlaggedRedemptions({ flagged }: { flagged: FlaggedRedemption[] }): ReactNode {
  if (flagged.length === 0) return null;
  return (
    <Callout tone="warn" title="Redemptions to check">
      <ul className="flex flex-col gap-xxs">
        {flagged.map((redemption) => (
          <li key={redemption.redemptionId}><AppLink href={entityPath({ kind: 'redemption', id: redemption.redemptionId })} className="text-primary underline">{flaggedRedemptionText(redemption)}</AppLink></li>
        ))}
      </ul>
    </Callout>
  );
}
