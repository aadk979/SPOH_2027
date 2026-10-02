import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The schema lint of ADR-001 "How it is tested" (2), finished at P09.10: a
 * model with an `eventId` is marked `@eventOwned` (or is one of the named
 * platform-level tables), its `eventId` is required, and every reference it
 * holds to an event-owned row starts with `(eventId, parentId)`, never one a
 * delete could null. Provenance may extend that composite with matching fields.
 */

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');

interface Model {
  name: string;
  owned: boolean;
  body: string;
}

const models: Model[] = [
  ...schema.matchAll(/((?:\/\/\/[^\n]*\n)*)model (\w+) \{\n(.*?)\n\}/gs),
].map(([, doc, name, body]) => ({
  name: name as string,
  owned: (doc as string).includes('@eventOwned'),
  body: body as string,
}));
const owned = models.filter((model) => model.owned);
const ownedNames = new Set(owned.map((model) => model.name));

/** Rows about the platform, not one event: their eventId is null for those. */
const PLATFORM_LEVEL = new Set([
  'AuditLog',
  'IdempotencyRecord',
  'Setting',
  'SettingChange',
  'ScheduledAction',
]);

/** `…Id` columns on event-owned rows that name nothing in the database. */
const NOT_REFERENCES = new Set(['Registration.groupId']);

function relations(model: Model) {
  return [...model.body.matchAll(/^\s*(\w+)\s+(\w+)(\??)\s+@relation\(([^)]*)\)/gm)].map(
    ([, field, target, , args]) => ({
      field: field as string,
      target: target as string,
      fields: /fields: \[([^\]]*)\]/.exec(args as string)?.[1] ?? '',
      references: /references: \[([^\]]*)\]/.exec(args as string)?.[1] ?? '',
      args: args as string,
    }),
  );
}

describe('the event-scoped schema (ADR-001 §2, P09.10)', () => {
  it('marks every model with an eventId as event-owned, or names it as platform-level', () => {
    const unmarked = models
      .filter((model) => /^\s*eventId\s/m.test(model.body) && !model.owned)
      .map((model) => model.name)
      .filter((name) => !PLATFORM_LEVEL.has(name));
    expect(unmarked).toEqual([]);
  });

  it('requires eventId on every event-owned row', () => {
    const nullable = owned
      .filter((model) => !/^\s*eventId\s+String\s/m.test(`${model.body}\n`))
      .map((model) => model.name);
    expect(nullable).toEqual([]);
  });

  it('keeps every reference between event-owned rows inside one event', () => {
    const loose = owned.flatMap((model) =>
      relations(model)
        .filter(({ target, fields }) => ownedNames.has(target) && fields !== '')
        .filter(({ fields, references }) => {
          const child = fields.split(',').map((field) => field.trim());
          const parent = references.split(',').map((field) => field.trim());
          return (
            child[0] !== 'eventId' ||
            parent[0] !== 'eventId' ||
            parent[1] !== 'id' ||
            child.length !== parent.length ||
            child.slice(2).join(',') !== parent.slice(2).join(',')
          );
        })
        .map(({ field }) => `${model.name}.${field}`),
    );
    expect(loose).toEqual([]);
  });

  it('never lets a delete null the eventId a reference shares', () => {
    const settingNull = owned.flatMap((model) =>
      relations(model)
        .filter(({ fields, args }) => fields.startsWith('eventId,') && args.includes('SetNull'))
        .map(({ field }) => `${model.name}.${field}`),
    );
    expect(settingNull).toEqual([]);
  });

  it('gives every reference column on an event-owned row a foreign key', () => {
    const unenforced = owned.flatMap((model) => {
      const keyed = new Set(
        relations(model).flatMap(({ fields }) => fields.split(',').map((f) => f.trim())),
      );
      return [...model.body.matchAll(/^\s*(\w+Id)\s+String/gm)]
        .map(([, column]) => column as string)
        .filter((column) => column !== 'eventId' && !keyed.has(column))
        .map((column) => `${model.name}.${column}`)
        .filter((name) => !NOT_REFERENCES.has(name));
    });
    expect(unenforced).toEqual([]);
  });

  it('gives every parent the (eventId, id) key the references point at', () => {
    const targets = new Set(
      owned.flatMap((model) =>
        relations(model)
          .filter(({ references }) => references.startsWith('eventId, id'))
          .map(({ target }) => target),
      ),
    );
    const unkeyed = owned
      .filter((model) => targets.has(model.name))
      .filter((model) => !model.body.includes('@@unique([eventId, id])'))
      .map((model) => model.name);
    expect(unkeyed).toEqual([]);
  });

  it('enforces the entire parent key when provenance extends a scoped reference', () => {
    const parents = new Map(models.map((model) => [model.name, model]));
    const unkeyed = owned.flatMap((model) =>
      relations(model)
        .filter(
          ({ target, references }) =>
            ownedNames.has(target) && references.startsWith('eventId, id,'),
        )
        .filter(
          ({ target, references }) =>
            !parents.get(target)?.body.includes(`@@unique([${references}])`),
        )
        .map(({ field }) => `${model.name}.${field}`),
    );
    expect(unkeyed).toEqual([]);
  });
});
