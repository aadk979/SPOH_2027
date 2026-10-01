import { describe, expect, it } from 'vitest';
import { generateBatchRows, toBatchCsv } from '../../src/modules/missionCard/domain/cardBatch.js';
import {
  assertCardNotVoided,
  assertDifferentCards,
  assertReissuable,
  assertReplacementUnissued,
  assertStationStamps,
  isJourneyComplete,
  replacementStatus,
  requireCard,
} from '../../src/modules/missionCard/domain/cardRules.js';
import { buildFunnelStages } from '../../src/modules/missionCard/domain/funnel.js';

/** Mission Card rules (P06.5): pure, so tested without a database. */

const code = (error: () => unknown): string | undefined => {
  try {
    error();
    return undefined;
  } catch (thrown) {
    return (thrown as { code?: string }).code;
  }
};

describe('card rules', () => {
  it('requireCard returns the card or a 404', () => {
    expect(requireCard({ id: 'c' })).toEqual({ id: 'c' });
    expect(code(() => requireCard(null))).toBe('CARD_NOT_FOUND');
  });

  it.each([
    ['UNISSUED', undefined],
    ['ISSUED', undefined],
    ['COMPLETED', undefined],
    ['VOIDED', 'CARD_VOIDED'],
  ] as const)('assertCardNotVoided(%s) → %s', (status, expected) => {
    expect(code(() => assertCardNotVoided({ status }, 'voided'))).toBe(expected);
  });

  it('refuses a stamp at a station that does not stamp', () => {
    expect(code(() => assertStationStamps({ name: 'Booth', issuesStamp: false }))).toBe(
      'STATION_DOES_NOT_STAMP',
    );
    expect(code(() => assertStationStamps({ name: 'Lab', issuesStamp: true }))).toBeUndefined();
  });

  it('a replacement must be another, unissued card', () => {
    expect(code(() => assertDifferentCards('ABC123', 'ABC123'))).toBe('CONFLICT');
    expect(code(() => assertReplacementUnissued({ status: 'ISSUED' }))).toBe('CARD_ALREADY_ISSUED');
    expect(code(() => assertReplacementUnissued({ status: 'UNISSUED' }))).toBeUndefined();
  });

  it.each([
    [3, 3, true],
    [2, 3, false],
    [0, 0, false],
  ])('isJourneyComplete(%i stamps, %i stations) → %s', (stamps, stations, complete) => {
    expect(isJourneyComplete(stamps, stations)).toBe(complete);
  });

  it('a replacement for a completed card is completed', () => {
    expect(replacementStatus('COMPLETED')).toBe('COMPLETED');
    expect(replacementStatus('ISSUED')).toBe('ISSUED');
  });
});

describe('card batch', () => {
  it.each([false, true])(
    'generates distinct codes and labels the print file (practice %s)',
    (rehearsal) => {
      const rows = generateBatchRows(50, { batchLabel: 'batch-1', rehearsal });
      expect(new Set(rows.map((row) => row.shortCode)).size).toBe(50);

      const csv = toBatchCsv(rows.slice(0, 2)).split('\n');
      expect(csv[0]).toBe('shortCode,qrPayload,batchLabel,mode');
      expect(csv[1]).toBe(
        `${rows[0]?.shortCode},${rows[0]?.qrPayload},batch-1,${rehearsal ? 'REHEARSAL' : 'LIVE'}`,
      );
    },
  );

  it.each([
    ['Practice, "Desk"', '"Practice, ""Desk"""'],
    ['=1+1', "'=1+1"],
    ['  @SUM(1)', "'  @SUM(1)"],
  ])('keeps the label %s in one safe spreadsheet cell', (batchLabel, expected) => {
    const csv = toBatchCsv([
      { shortCode: 'ABC234', qrPayload: 'opaque', batchLabel, rehearsal: true },
    ]);
    expect(csv.split('\n')[1]).toBe(`ABC234,opaque,${expected},REHEARSAL`);
  });
});

describe('buildFunnelStages', () => {
  it('rates every stage against the cards issued', () => {
    const stages = buildFunnelStages({
      issued: 10,
      completed: 4,
      redeemed: 2,
      stations: [{ id: 's1', code: 'LAB', name: 'Lab' }],
      perStation: new Map([['s1', 5]]),
    });

    expect(stages.map((stage) => [stage.key, stage.value, stage.rateOfIssued])).toEqual([
      ['issued', 10, 1],
      ['LAB', 5, 0.5],
      ['completed', 4, 0.4],
      ['redeemed', 2, 0.2],
    ]);
  });

  it('rates nothing when no card was issued', () => {
    const stages = buildFunnelStages({
      issued: 0,
      completed: 0,
      redeemed: 0,
      stations: [],
      perStation: new Map(),
    });
    expect(stages.every((stage) => stage.rateOfIssued === 0)).toBe(true);
  });
});

describe('assertReissuable (F03-027)', () => {
  it.each([
    ['ISSUED', undefined],
    ['COMPLETED', undefined],
    ['VOIDED', 'CARD_VOIDED'],
    ['LOST', 'CARD_VOIDED'],
    ['UNISSUED', 'CARD_NOT_ISSUED'],
  ] as const)('%s → %s', (status, expected) => {
    expect(code(() => assertReissuable({ status }))).toBe(expected);
  });
});
