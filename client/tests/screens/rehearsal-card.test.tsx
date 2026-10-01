import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MissionCardRecord } from '@spoh/shared';
import { CardSummary } from '@/features/cards/components/CardSummary';

afterEach(cleanup);
it.each([false, true])('uses stored card provenance for its label (practice %s)', (rehearsal) => {
  const card = MissionCardRecord.parse({
    id: 'card',
    rehearsal,
    shortCode: 'ABC234',
    status: 'ISSUED',
    issuedAt: '2027-01-07T02:00:00Z',
    completedAt: null,
    voidedAt: null,
    reissuedFromId: null,
    batchLabel: 'Print run',
    stamps: [],
    remainingStationIds: [],
    redeemed: false,
  });
  render(<CardSummary card={card} />);
  expect(Boolean(screen.queryByText('REHEARSAL · Practice card'))).toBe(rehearsal);
  expect(screen.getByText('0 stamps so far')).toBeTruthy();
});
