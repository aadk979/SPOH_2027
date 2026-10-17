import { expect, it } from 'vitest';
import { ListAnnouncementsQuery } from './index.js';
it('omission preserves false and the ordinary pagination default', () => {
  expect(ListAnnouncementsQuery.parse({})).toMatchObject({ limit: 50, unackedOnly: false });
});
it.each([
  { raw: 'true', expected: true },
  { raw: 'false', expected: false },
])('parses the exact URL flag $raw', ({ raw, expected }) => {
  expect(ListAnnouncementsQuery.parse({ unackedOnly: raw }).unackedOnly).toBe(expected);
});
const invalid: unknown[] = [
  'TRUE',
  'FALSE',
  'yes',
  'no',
  '1',
  '0',
  'null',
  '',
  ' true',
  'false ',
  ['true', 'true'],
  ['false', 'true'],
  null,
  true,
  false,
  0,
  1,
  {},
  [],
  ['true'],
];
it.each(invalid.map((value, index) => ({ value, index })))(
  'rejects malformed or non-string flag $index',
  ({ value }) => {
    expect(ListAnnouncementsQuery.safeParse({ unackedOnly: value }).success).toBe(false);
  },
);
it('keeps unknown query keys refused', () => {
  expect(
    ListAnnouncementsQuery.safeParse({ unackedOnly: 'false', unexpected: 'true' }).success,
  ).toBe(false);
});
