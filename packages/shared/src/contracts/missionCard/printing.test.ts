import { describe, expect, it } from 'vitest';
import {
  CardPrintExportDetailResponse,
  CardPrintExportListQuery,
  CardPrintExportListResponse,
} from './printing.js';

const record = {
  id: 'synthetic-print-export',
  format: 'pdf',
  count: 1,
  rehearsal: false,
  createdAt: '2026-10-11T04:00:00.000Z',
};
const context = {
  eventName: 'Open day 开放日 தமிழ்',
  stampingStations: [{ id: 'station-one', name: 'Hands-on station' }],
  batches: [{ shortCode: 'ABC123', batchLabel: 'Morning' }],
};

describe('private historical print metadata contracts', () => {
  it('bounds pagination and rejects transport-only or unreviewed filters', () => {
    expect(CardPrintExportListQuery.parse({})).toEqual({ limit: 50 });
    expect(CardPrintExportListQuery.parse({ limit: '200', cursor: record.id }).limit).toBe(200);
    for (const query of [{ limit: 0 }, { limit: 201 }, { cursor: '' }, { eventId: 'foreign' }])
      expect(CardPrintExportListQuery.safeParse(query).success).toBe(false);
  });

  it('preserves Unicode frozen labels and explicitly permits unknown legacy context', () => {
    const data = { ...record, shortCodes: ['ABC123'], printContext: context };
    expect(CardPrintExportDetailResponse.parse({ data }).data.printContext).toEqual(context);
    expect(
      CardPrintExportDetailResponse.parse({
        data: { ...record, shortCodes: [], printContext: null },
      }).data.printContext,
    ).toBeNull();
  });

  it('refuses object keys, opaque QR payloads and private actor fields in public responses', () => {
    const data = { ...record, shortCodes: ['ABC123'], printContext: context };
    for (const extra of [
      { objectKey: 'private/key' },
      { qrPayload: 'opaque' },
      { actorSub: 'sub' },
    ]) {
      expect(CardPrintExportDetailResponse.safeParse({ data: { ...data, ...extra } }).success).toBe(
        false,
      );
      expect(
        CardPrintExportListResponse.safeParse({
          data: [{ ...record, ...extra }],
          meta: { count: 1, nextCursor: null },
        }).success,
      ).toBe(false);
    }
  });

  it('refuses unreviewed fields nested inside frozen export context', () => {
    expect(
      CardPrintExportDetailResponse.safeParse({
        data: {
          ...record,
          shortCodes: ['ABC123'],
          printContext: { ...context, batches: [{ ...context.batches[0], qrPayload: 'opaque' }] },
        },
      }).success,
    ).toBe(false);
  });
});
