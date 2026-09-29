import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertEventScoped, MissingEventScopeError } from '../../src/platform/db/eventScope.js';
// @ts-expect-error -- a plain ESM script without types.
import { generate } from '../../scripts/generate-event-owned.mjs';

/** ADR-001 §2: a query on an event-owned model names its event, or it throws. */
describe('the event-scope guard', () => {
  const scoped = (operation: string, args: Record<string, unknown>) => () =>
    assertEventScoped('Registration', operation, args);

  it.each([
    ['findMany', { where: { eventId: 'e1', voided: false } }],
    ['findFirst', { where: { AND: [{ eventId: 'e1' }, { id: 'r1' }] } }],
    ['findUnique', { where: { eventId_id: { eventId: 'e1', id: 'r1' } } }],
    ['count', { where: { eventId: { equals: 'e1' } } }],
    ['groupBy', { by: ['categoryId'], where: { eventId: { in: ['e1'] } } }],
    ['updateMany', { where: { eventId: 'e1' }, data: { voided: true } }],
    ['create', { data: { eventId: 'e1' } }],
    ['create', { data: { event: { connect: { id: 'e1' } } } }],
    ['createManyAndReturn', { data: [{ eventId: 'e1' }, { eventId: 'e1' }] }],
    ['upsert', { where: { eventId_id: { eventId: 'e1', id: 'r1' } }, create: { eventId: 'e1' } }],
  ])('lets %s through with its event', (operation, args) => {
    expect(scoped(operation, args)).not.toThrow();
  });

  it.each([
    ['findUnique', { where: { id: 'r1' } }],
    ['findMany', {}],
    ['findMany', { where: { OR: [{ eventId: 'e1' }, { id: 'r1' }] } }],
    ['count', { where: { eventId: undefined } }],
    ['update', { where: { id: 'r1' }, data: { voided: true } }],
    ['deleteMany', { where: {} }],
    ['create', { data: { stationId: 's1' } }],
    ['createMany', { data: [{ eventId: 'e1' }, { stationId: 's1' }] }],
    ['upsert', { where: { eventId_id: { eventId: 'e1', id: 'r1' } }, create: {} }],
  ])('refuses %s without it', (operation, args) => {
    expect(scoped(operation, args)).toThrow(MissingEventScopeError);
  });

  it('is a server bug: a 500 whose message is not shown', () => {
    const error = new MissingEventScopeError('Registration', 'findMany');
    expect(error.statusCode).toBe(500);
    expect(error.expose).toBe(false);
  });
});

describe('the list of event-owned models', () => {
  it('is generated from the schema and up to date', () => {
    const committed = readFileSync(
      new URL('../../src/platform/db/eventOwned.generated.ts', import.meta.url),
      'utf8',
    );
    expect(committed).toBe(generate());
  });
});
