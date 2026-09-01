import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * BUILD_PLAN §3.2 rule 5 — the no-visitor-PII guard.
 *
 * "No visitor personal data" is a promise until something enforces it. This
 * test reads `schema.prisma` and asserts that no visitor-scoped model carries a
 * field whose name suggests a name, a contact detail, a school or an
 * identifier. It is a lint on intent as much as on data: a future field called
 * `visitorSchool` fails here before it ever reaches a migration.
 *
 * Two allowlists carry the exceptions, and both are deliberately narrow:
 *  - committee models legitimately hold names and contact details (§0.2)
 *  - `LostPersonAlert` is the single visitor-scoped exception, and it is purged
 *    to `LostPersonSummary` after resolution (§5.9)
 */

const SCHEMA = readFileSync(
  fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)),
  'utf8',
);

/** Field names that would indicate personal data. */
const PII_FIELD_PATTERN = /name|email|phone|nric|ic_num|address|school|dob|birth|photo/i;

/** Models that legitimately describe committee members, not visitors. */
const COMMITTEE_MODELS = new Set([
  'Volunteer',
  'ShiftAssignment',
  'ShiftSwapRequest',
  'BriefingSlot',
  'AuditLog',
]);

/**
 * Models whose "name" fields describe a thing, not a person — a station's name,
 * a gift type's name, an event day's label.
 */
const REFERENCE_MODELS = new Set([
  'EventDay',
  'Station',
  'GiftType',
  'ImportBatch',
  'Announcement',
]);

/**
 * The single visitor-scoped exception (§7.3). Its descriptive fields are nulled
 * 24 hours after resolution and the surviving record is anonymised.
 */
const TRANSIENT_EXCEPTIONS = new Set(['LostPersonAlert']);

/**
 * Individual fields that trip the pattern but are not personal data.
 *
 * `LostFoundItem.photoKey` is a photo of a found object — an umbrella, a water
 * bottle — which PRODUCT_BRIEF §7.2 asks for explicitly. The rule bans
 * photographs of identifiable visitors, and a picture of a lost jacket on a
 * desk is not one. Anything added here needs the same kind of justification.
 */
const FIELD_ALLOWLIST = new Set(['LostFoundItem.photoKey']);

interface ParsedModel {
  name: string;
  fields: string[];
}

function parseModels(schema: string): ParsedModel[] {
  const models: ParsedModel[] = [];
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  for (const match of schema.matchAll(modelPattern)) {
    const [, name, body] = match;
    if (!name || !body) continue;

    const fields = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/)[0])
      .filter((field): field is string => Boolean(field) && !field.startsWith('/'));

    models.push({ name, fields });
  }

  return models;
}

const MODELS = parseModels(SCHEMA);

describe('no visitor personal data (BUILD_PLAN §3.2)', () => {
  it('parses the schema', () => {
    expect(MODELS.length).toBeGreaterThan(15);
    expect(MODELS.map((m) => m.name)).toContain('Registration');
  });

  const visitorScoped = MODELS.filter(
    (model) =>
      !COMMITTEE_MODELS.has(model.name) &&
      !REFERENCE_MODELS.has(model.name) &&
      !TRANSIENT_EXCEPTIONS.has(model.name),
  );

  for (const model of visitorScoped) {
    it(`${model.name} has no PII-shaped field`, () => {
      const offenders = model.fields.filter(
        (field) => PII_FIELD_PATTERN.test(field) && !FIELD_ALLOWLIST.has(`${model.name}.${field}`),
      );
      expect(offenders, `${model.name} declares ${offenders.join(', ')}`).toEqual([]);
    });
  }

  it('keeps Registration to a category and a timestamp', () => {
    const registration = MODELS.find((model) => model.name === 'Registration');
    expect(registration).toBeDefined();
    // No free-text field of any kind other than the void reason, which is an
    // IC-only correction note about the record, not about a person.
    expect(registration?.fields).toContain('category');
    expect(registration?.fields).not.toContain('notes');
    expect(registration?.fields).not.toContain('description');
  });

  it('keeps the three counts unjoined', () => {
    const registration = MODELS.find((model) => model.name === 'Registration');
    const footfall = MODELS.find((model) => model.name === 'FootfallTick');

    // There is no foreign key from footfall to registration, in either
    // direction. One Mission Card can be four humans; a room entry is a body
    // through a door. Joining them would produce a number that means nothing.
    expect(registration?.fields).not.toContain('footfallTickId');
    expect(footfall?.fields).not.toContain('registrationId');
  });

  it('has no totalVisitors field on any model', () => {
    // Checked against parsed fields, not raw text: the schema header explains
    // in prose why no such column exists, and that explanation should stay.
    const offenders = MODELS.flatMap((model) =>
      model.fields
        .filter((field) => /total.?visitors/i.test(field))
        .map((field) => `${model.name}.${field}`),
    );
    expect(offenders).toEqual([]);
  });

  it('documents the lost-person exception as transient', () => {
    // The purge is what makes the exception acceptable, so the schema must say
    // so where the next person to read it will see it.
    expect(SCHEMA).toMatch(/TRANSIENT by design/);
    expect(MODELS.map((m) => m.name)).toContain('LostPersonSummary');
  });
});
