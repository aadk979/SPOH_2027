import type { ReactNode } from 'react';
import type { MissionCardRecord } from '@spoh/shared';
import { Card, CardTitle } from '@/shared/ui';
/** What the facilitator reads out: where they have been, where to go next. */
export function CardSummary({ card }: { card: MissionCardRecord }): ReactNode {
  return (
    <Card>
      <CardTitle className="font-display tracking-[0.15em]">{card.shortCode}</CardTitle>
      {card.rehearsal ? (
        <p className="text-caption font-semibold">REHEARSAL · Practice card</p>
      ) : null}
      <p className="text-caption text-text-muted">
        {card.status === 'COMPLETED' ? 'Journey complete' : `${card.stamps.length} stamps so far`}
      </p>

      <ul className="mt-sm flex flex-col gap-xxs">
        {card.stamps.map((stampRecord) => (
          <li key={stampRecord.id}>
            <span aria-hidden="true" className="mr-xs text-ok">
              ✓
            </span>
            {stampRecord.stationName}
          </li>
        ))}
      </ul>

      {card.remainingStationIds.length > 0 ? (
        <p className="mt-sm text-caption text-text-muted">
          {card.remainingStationIds.length} station
          {card.remainingStationIds.length === 1 ? '' : 's'} still to visit.
        </p>
      ) : null}
    </Card>
  );
}
