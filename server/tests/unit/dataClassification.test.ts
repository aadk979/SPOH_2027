import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLEARED_ON_PURGE } from '../../src/modules/lostPerson/data/repo.js';

/**
 * Data classification (ADR-002 §5, F04-016, P09.14). Every text or JSON
 * column declares its class with `/// @class`, so a new column cannot hold
 * personal data without saying so, and the class decides its retention and
 * where it may appear.
 *
 * The five classes are ADR-002's. `credential` marks what is secret without
 * being personal (a PIN or token hash, a push key): never logged, never in an
 * audit value, a push payload or an export.
 */

const CLASSES = new Set([
  'operational',
  'staff-personal',
  'visitor-transient',
  'visitor-personal',
  'media',
  'credential',
]);

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');

interface Column {
  model: string;
  field: string;
  cls: string | null;
}

/** Text and JSON columns that hold values, with the class declared just above each. */
const columns: Column[] = [...schema.matchAll(/model (\w+) \{\n(.*?)\n\}/gs)].flatMap(
  ([, model, body]) => {
    const lines = (body as string).split('\n');
    return lines.flatMap((line, index) => {
      const column = /^\s*(\w+)\s+(?:String|Json)\??(?:\s|$)/.exec(line);
      const field = column?.[1];
      if (!field || field === 'id' || field.endsWith('Id') || field === 'idempotencyKey') {
        return [];
      }
      const above = /^\s*\/\/\/ @class (\S+)\s*$/.exec(lines[index - 1] ?? '');
      return [{ model: model as string, field, cls: above?.[1] ?? null }];
    });
  },
);

const named = (filter: (column: Column) => boolean): string[] =>
  columns.filter(filter).map(({ model, field }) => `${model}.${field}`);

describe('data classification (ADR-002 §5)', () => {
  it('finds the columns it guards', () => {
    expect(columns.length).toBeGreaterThan(80);
  });

  it('declares a known class on every text and JSON column', () => {
    expect(named((column) => column.cls === null || !CLASSES.has(column.cls))).toEqual([]);
  });

  it('keeps visitor-transient data on the lost-person alert alone', () => {
    expect(
      named((column) => column.cls === 'visitor-transient' && column.model !== 'LostPersonAlert'),
    ).toEqual([]);
  });

  it('has the purge clear exactly the visitor-transient columns', () => {
    const transient = named((column) => column.cls === 'visitor-transient');
    expect(
      Object.keys(CLEARED_ON_PURGE)
        .map((field) => `LostPersonAlert.${field}`)
        .sort(),
    ).toEqual(transient.sort());
  });

  it('keeps visitor-personal data out of every table but the visitor record', () => {
    expect(
      named((column) => column.cls === 'visitor-personal' && column.model !== 'VisitorRecord'),
    ).toEqual([]);
  });

  it('gives a registration no personal column at all: counts never depend on who', () => {
    expect(
      named((column) => column.model === 'Registration' && column.cls !== 'operational'),
    ).toEqual([]);
  });
});
