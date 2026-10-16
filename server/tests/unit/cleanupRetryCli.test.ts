import { expect, it } from 'vitest';
// @ts-expect-error -- Import-safe JavaScript operator parser does not load application configuration.
import { parseCleanupRetryArguments } from '../../scripts/retry-content-cleanup.mjs';

it('defaults to a read-only plan for one exact action', () => {
  expect(parseCleanupRetryArguments(['--id', 'known-action'])).toEqual({
    id: 'known-action',
    apply: false,
  });
});
it('requires a concrete reviewed version and explanation before applying', () => {
  expect(
    parseCleanupRetryArguments([
      '--id',
      'known-action',
      '--apply',
      '--expected-version',
      '7',
      '--reason',
      'Synthetic repair verified',
      '--operator-reference',
      'Synthetic rehearsal',
    ]),
  ).toMatchObject({ apply: true, id: 'known-action', 'expected-version': '7' });
});
it.each(
  [
    [],
    ['--id'],
    ['--id', '../other'],
    ['--id', 'id', '--force'],
    ['--id', 'id', '--id', 'other'],
    ['--id', 'id', '--apply'],
    ['--id', 'id', '--apply', '--apply'],
    ['--id', 'id', '--expected-version', '7'],
    [
      '--id',
      'id',
      '--apply',
      '--expected-version',
      '0',
      '--reason',
      'reason',
      '--operator-reference',
      'ref',
    ],
    [
      '--id',
      'id',
      '--apply',
      '--expected-version',
      '1.5',
      '--reason',
      'reason',
      '--operator-reference',
      'ref',
    ],
    [
      '--id',
      'id',
      '--apply',
      '--expected-version',
      '9007199254740992',
      '--reason',
      'reason',
      '--operator-reference',
      'ref',
    ],
    [
      '--id',
      'id',
      '--apply',
      '--expected-version',
      '7',
      '--reason',
      ' ',
      '--operator-reference',
      'ref',
    ],
    [
      '--id',
      'id',
      '--apply',
      '--expected-version',
      '7',
      '--reason',
      'reason',
      '--operator-reference',
      ' ',
    ],
  ].map((args) => ({ args })),
)('refuses malformed or ambiguous operator arguments before I/O: %j', ({ args }) => {
  expect(() => parseCleanupRetryArguments(args)).toThrow();
});
