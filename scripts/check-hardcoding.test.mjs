import assert from 'node:assert/strict';
import test from 'node:test';
import { findingsIn } from './check-hardcoding.mjs';

const hits = (text) => findingsIn('client/src/example.ts', text);

test('finds the F01 patterns: dates, the brand and venue, course codes, zones', () => {
  assert.equal(hits("const opens = '2027-01-06';").length, 1);
  assert.equal(hits("title: 'SPOH 2027 Ops'").length, 1);
  assert.equal(hits("label: 'Welcome Party at T19'").length, 1);
  assert.equal(hits("code: 'DCDF'").length, 1);
  assert.equal(hits("const TZ = 'Asia/Singapore';").length, 1);
});

test('leaves the package scope and ordinary code alone', () => {
  assert.deepEqual(hits("import type { MeResponse } from '@spoh/shared';"), []);
  assert.deepEqual(hits('const total = registrations + 2027;'), []);
});

test('honours a stated reason on the line, the line above, or the file', () => {
  assert.deepEqual(hits("const DB = 'spoh2027'; // hardcoding-allowed: storage name"), []);
  assert.deepEqual(hits("// hardcoding-allowed: storage name\nconst DB = 'spoh2027';"), []);
  assert.deepEqual(
    hits("// hardcoding-allowed-file: content\nconst a = 'T19';\nconst b = 'DAAA';"),
    [],
  );
  assert.equal(hits("// hardcoding-allowed:\nconst DB = 'spoh2027';").length, 1);
});
