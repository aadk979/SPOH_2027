import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/features/fallback/model/parseImportCsv';

describe('fallback CSV parsing', () => {
  it('ignores blank lines and comments and trims headings and cells', () => {
    expect(
      parseCsv('# paper tally\r\n category, count \r\n\r\n SEC_4, 12 \r\n', 'registrations'),
    ).toEqual([{ category: 'SEC_4', count: 12 }]);
  });
  it('defaults only missing registration counts to one', () => {
    expect(parseCsv('category,count\nSEC_4,\nPARENT_GUARDIAN,0', 'registrations')).toEqual([
      { category: 'SEC_4', count: 1 },
      { category: 'PARENT_GUARDIAN', count: 0 },
    ]);
    expect(parseCsv('stationCode,quantity\nROOM_A,', 'footfall')).toEqual([
      { stationCode: 'ROOM_A' },
    ]);
  });
  it('converts quantity while preserving station codes and timestamps', () => {
    expect(
      parseCsv('stationCode,quantity,timeBlockStart\n001,42,2027-01-07T03:30:00.000Z', 'footfall'),
    ).toEqual([{ stationCode: '001', quantity: 42, timeBlockStart: '2027-01-07T03:30:00.000Z' }]);
  });
  it('returns no rows for an empty or header-only input', () => {
    expect(parseCsv('', 'registrations')).toEqual([]);
    expect(parseCsv('category,count\n# no entries', 'registrations')).toEqual([]);
  });
  it('leaves invalid numeric values for server row validation', () => {
    const [row] = parseCsv('stationCode,quantity\nROOM_A,invalid', 'footfall');
    expect(row?.quantity).toBeNaN();
  });
});
