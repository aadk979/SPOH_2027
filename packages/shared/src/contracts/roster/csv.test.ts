import { describe, expect, it } from 'vitest';
import { parseRosterCsv, ROSTER_CSV_HEADER } from './csv.js';

describe('event-agnostic roster CSV', () => {
  it('reads quoted names, escaped quotes, multiline cells, BOM and spreadsheet aliases', () => {
    const parsed = parseRosterCsv(
      '\uFEFFFull Name;Email Address;role;team;block\r\n"Sample, ""Person""";UPPER@example.test;DC;"First\nSecond";Evening\r\n',
    );
    expect(parsed).toEqual({
      totalRows: 1,
      issues: [],
      rows: [
        {
          displayName: 'Sample, "Person"',
          email: 'upper@example.test',
          role: 'DEPUTY_COORDINATOR',
          portfolio: 'First\nSecond',
          shift: 'Evening',
        },
      ],
    });
  });
  it('accepts tabs, defaults a blank role, preserves configurable station and shift codes', () => {
    expect(
      parseRosterCsv(
        'displayName\temail\tstationCode\tshift\nSample\ta@example.test\tMixedCase\tCustom night\n\n',
      ).rows[0],
    ).toMatchObject({ role: 'VOLUNTEER', stationCode: 'MixedCase', shift: 'Custom night' });
    expect(ROSTER_CSV_HEADER).toContain('eventDate,shift');
  });
  it('reports every invalid row with source line numbers without silently applying valid rows', () => {
    const parsed = parseRosterCsv(
      'displayName,email,role\nValid,a@example.test,Volunteer\nBad,bad,wrong\nExtra,b@example.test,IC,unexpected',
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowNumber: 3, field: 'email' }),
        expect.objectContaining({ rowNumber: 3, field: 'role' }),
        expect.objectContaining({ rowNumber: 4, field: 'row' }),
      ]),
    );
  });
  it.each([
    ['', /header/],
    ['name\nSample', /displayName and email/],
    ['name,email,notes\nSample,a@example.test,text', /unrecognised/],
    ['name,email,email\nSample,a@example.test,a@example.test', /once/],
    ['name,email\n"Unclosed,a@example.test', /quoted/],
  ])('rejects unusable input %j', (text, message) =>
    expect(() => parseRosterCsv(text)).toThrow(message),
  );
  it('limits the input before making an API plan', () => {
    const text =
      'name,email\n' +
      Array.from({ length: 1001 }, (_, index) => `Sample ${index},a${index}@example.test`).join(
        '\n',
      );
    expect(() => parseRosterCsv(text)).toThrow('1,000');
  });
});
