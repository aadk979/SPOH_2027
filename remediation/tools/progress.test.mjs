import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFlags } from './progress.mjs';

test('--force does not consume the note that follows it', () => {
  const note = 'ADR-010 prerequisite work';
  assert.deepEqual(parseFlags(['--force', '--note', note]), { force: true, note });
  assert.deepEqual(parseFlags(['--note', note, '--force']), { force: true, note });
});

test('value flags keep their values', () => {
  assert.deepEqual(parseFlags(['--commit', 'abc1234', '--replace-commit', 'HEAD']), {
    commit: 'abc1234',
    'replace-commit': 'HEAD',
  });
  assert.deepEqual(parseFlags(['--answer', 'approved']), { answer: 'approved' });
});

test('a value flag never swallows the next flag or goes missing', () => {
  assert.throws(() => parseFlags(['--note', '--force']), /--note needs a value/);
  assert.throws(() => parseFlags(['--commit']), /--commit needs a value/);
});

test('unknown flags are refused rather than silently ignored', () => {
  assert.throws(() => parseFlags(['--notes', 'typo']), /unknown flag --notes/);
});
