import { describe, expect, it } from 'vitest';
import {
  ROSTER_CSV_HEADER,
  ROSTER_CSV_TEMPLATE,
  normaliseEventDate,
  parseRosterCsv,
  serialiseRosterCsv,
} from '@spoh/shared';

/**
 * The roster CSV reader.
 *
 * Every case here is a file somebody actually produces: a paste out of Excel,
 * a Sheets export with friendlier headers, a name with a comma in it, a date
 * typed the Singapore way. The reader's job is to accept all of them and to
 * refuse the rest with a message that names the line and the column.
 */

describe('parseRosterCsv', () => {
  it('reads the template', () => {
    const parsed = parseRosterCsv(ROSTER_CSV_TEMPLATE);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]?.row).toMatchObject({
      displayName: 'Tan Mei Ling',
      email: 'meiling@example.edu.sg',
      role: 'IC',
      stationCode: 'SIGNUP_BOOTH',
      eventDate: '2027-01-07',
      block: 'MORNING',
    });
  });

  it('numbers rows the way a spreadsheet does, header included', () => {
    const parsed = parseRosterCsv('displayName,email\nA,a@x.test\n,\nB,not-an-email\n');

    expect(parsed.rows.map((r) => r.line)).toEqual([2]);
    expect(parsed.errors).toEqual([
      { line: 4, field: 'email', message: '"not-an-email" is not an email address' },
    ]);
    expect(parsed.totalRows).toBe(2);
  });

  it('accepts a paste out of Excel: tabs, CRLF and a byte-order mark', () => {
    const text =
      String.fromCharCode(0xfeff) + 'Name\tEmail\tRole\r\nTan Ah Kow\tkow@x.test\tIC\r\n';
    const parsed = parseRosterCsv(text);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.row).toEqual({
      displayName: 'Tan Ah Kow',
      email: 'kow@x.test',
      role: 'IC',
    });
  });

  it('keeps a quoted name with a comma in it as one person', () => {
    const parsed = parseRosterCsv('displayName,email\n"Tan, Mei Ling",mei@x.test\n');

    expect(parsed.rows[0]?.row.displayName).toBe('Tan, Mei Ling');
  });

  it('understands the headers people actually write', () => {
    const text =
      'Full Name,Email Address,Committee Role,Mobile,Team,Manager,Station,Date,Shift,Position\n' +
      'A,a@x.test,DC,91234567,Ops,b@x.test,BOOTH,7/1/2027,pm,Usher\n';
    const parsed = parseRosterCsv(text);

    expect(parsed.errors).toEqual([]);
    expect(parsed.unknownColumns).toEqual([]);
    expect(parsed.rows[0]?.row).toEqual({
      displayName: 'A',
      email: 'a@x.test',
      role: 'DEPUTY_COORDINATOR',
      phone: '91234567',
      portfolio: 'Ops',
      reportsToEmail: 'b@x.test',
      stationCode: 'BOOTH',
      eventDate: '2027-01-07',
      block: 'AFTERNOON',
      roleLabel: 'Usher',
    });
  });

  it('leaves the role alone when the column is absent, rather than defaulting it', () => {
    const parsed = parseRosterCsv('name,email\nA,a@x.test\n');
    expect(parsed.rows[0]?.row.role).toBeUndefined();
  });

  it('reports a column it does not recognise without failing the file', () => {
    const parsed = parseRosterCsv('name,email,Notes\nA,a@x.test,late\n');

    expect(parsed.unknownColumns).toEqual(['Notes']);
    expect(parsed.rows).toHaveLength(1);
  });

  it('refuses a file with no email column at all', () => {
    const parsed = parseRosterCsv('name,phone\nA,9123\n');

    expect(parsed.missingColumns).toEqual(['email']);
    expect(parsed.rows).toEqual([]);
  });

  it('names the mistake in words a Chief can act on', () => {
    const text =
      'name,email,role,shift,date,phone\n' +
      'A,a@x.test,Boss,,,\n' +
      'B,b@x.test,,Evening,,\n' +
      'C,c@x.test,,,Jan 7,\n' +
      'D,d@x.test,,,,123\n';
    const parsed = parseRosterCsv(text);

    expect(parsed.errors.map((e) => [e.line, e.field])).toEqual([
      [2, 'role'],
      [3, 'block'],
      [4, 'eventDate'],
      [5, 'phone'],
    ]);
    expect(parsed.errors[0]?.message).toContain('Deputy Coordinator');
    expect(parsed.errors[1]?.message).toContain('AM or PM');
    expect(parsed.errors[2]?.message).toContain('YYYY-MM-DD');
  });

  it('flags a pasted subtotal line once, not per column', () => {
    const parsed = parseRosterCsv('name,email,phone\nA,a@x.test,\n,,Total: 1\n');

    expect(parsed.errors).toEqual([
      {
        line: 3,
        field: 'row',
        message: 'This line has no name and no email — is it a note or a subtotal?',
      },
    ]);
  });

  it('lower-cases emails so the same person is the same key', () => {
    const parsed = parseRosterCsv('name,email\nA,Mei.Ling@X.Test\n');
    expect(parsed.rows[0]?.row.email).toBe('mei.ling@x.test');
  });
});

describe('normaliseEventDate', () => {
  it('reads Singapore day-first dates and leaves ISO alone', () => {
    expect(normaliseEventDate('7/1/2027')).toBe('2027-01-07');
    expect(normaliseEventDate('07-01-2027')).toBe('2027-01-07');
    expect(normaliseEventDate('2027-01-07')).toBe('2027-01-07');
    expect(normaliseEventDate('2027-01-07T00:00:00.000Z')).toBe('2027-01-07');
    expect(normaliseEventDate('2027/1/7')).toBe('2027-01-07');
  });

  it('passes anything else through for the schema to reject', () => {
    expect(normaliseEventDate('Jan 7')).toBe('Jan 7');
  });
});

describe('serialiseRosterCsv', () => {
  it('round-trips through the parser', () => {
    const csv = serialiseRosterCsv([
      {
        displayName: 'Tan, Mei Ling',
        email: 'mei@x.test',
        role: 'IC',
        phone: '+65 9123 4567',
        stationCode: 'BOOTH',
        eventDate: '2027-01-07',
        block: 'MORNING',
        roleLabel: 'Station "IC"',
      },
      { displayName: 'Ravi', email: 'ravi@x.test', role: 'VOLUNTEER' },
    ]);

    expect(csv.startsWith(ROSTER_CSV_HEADER)).toBe(true);

    const parsed = parseRosterCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.row).toMatchObject({
      displayName: 'Tan, Mei Ling',
      roleLabel: 'Station "IC"',
      block: 'MORNING',
    });
    expect(parsed.rows[1]?.row).toEqual({
      displayName: 'Ravi',
      email: 'ravi@x.test',
      role: 'VOLUNTEER',
    });
  });

  it('neutralises a cell that Excel would run as a formula', () => {
    const csv = serialiseRosterCsv([{ displayName: '=HYPERLINK("x")', email: 'a@x.test' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
