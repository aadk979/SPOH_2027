import { describe, expect, it } from 'vitest';
import {
  GENERATED_SETTING_METADATA as metadata,
  ScopedSettingsMutationRequest,
  scopedOperationalKeys,
} from '@spoh/shared';
import {
  catalogueField,
  catalogueFieldFromSchema,
  catalogueInputValue,
  catalogueProposedValue,
} from '@/features/settings/model/catalogueEdit';

describe('generated catalogue editable fields', () => {
  it('previews exactly the validated and normalised registered value', () => {
    expect(catalogueProposedValue('vocabulary.missionCard', '  Label  ')).toBe('Label');
    expect(catalogueProposedValue('vocabulary.missionCard', '  ')).toBeNull();
    expect(catalogueProposedValue('silentStationMinutes', '')).toBeNull();
    expect(catalogueProposedValue('silentStationMinutes', '21')).toBe(21);
    expect(catalogueProposedValue('capture.open', false)).toBe(false);
    expect(catalogueProposedValue('incident.pushSeverities', [])).toEqual([]);
  });
  it('supports exactly the public operational selections', () => {
    for (const scope of ['event', 'station'] as const)
      for (const key of scopedOperationalKeys(scope)) expect(catalogueField(key)).not.toBeNull();
  });
  it('derives integer and fractional bounds from generated schemas', () => {
    expect(catalogueField('silentStationMinutes')).toEqual({
      kind: 'number',
      minimum: 1,
      maximum: 1440,
      step: 1,
    });
    expect(catalogueField('implausibleTapsPerMinute')).toEqual({
      kind: 'number',
      minimum: 1,
      maximum: 600,
      step: 'any',
    });
  });
  it('derives string lengths, boolean fields and enum options', () => {
    expect(catalogueField('vocabulary.missionCard')).toEqual({
      kind: 'text',
      minimum: 1,
      maximum: 40,
    });
    expect(catalogueField('capture.open')).toEqual({ kind: 'boolean' });
    expect(catalogueField('incident.pushSeverities')).toEqual({
      kind: 'multiple',
      options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      maximum: 4,
    });
    expect(catalogueField('report.curveBucketMinutes')).toEqual({
      kind: 'choice',
      options: [15, 30, 60],
    });
  });
  it('reads changed metadata rather than hardcoded key limits', () => {
    expect(catalogueFieldFromSchema({ type: 'integer', minimum: 7, maximum: 9 })).toEqual({
      kind: 'number',
      minimum: 7,
      maximum: 9,
      step: 1,
    });
    expect(catalogueFieldFromSchema({ type: 'string', minLength: 2, maxLength: 17 })).toEqual({
      kind: 'text',
      minimum: 2,
      maximum: 17,
    });
  });
  it.each([
    null,
    {},
    { type: 'object' },
    { type: 'number' },
    { type: 'integer', minimum: 3, maximum: 1 },
    { type: 'array', items: { type: 'string' } },
    { type: 'array', items: { enum: ['OK', 1] }, maxItems: 2 },
    { anyOf: [{ const: 1 }, { const: 'bad' }] },
    { anyOf: [] },
    { type: 'string', minLength: 0 },
  ])('refuses unsupported or malformed metadata %j', (schema) => {
    expect(catalogueFieldFromSchema(schema)).toBeNull();
  });
  it.each(['', ' ', 'NaN', 'Infinity', 'broken'])(
    'keeps invalid numeric input invalid: %j',
    (raw) => {
      const value = catalogueInputValue(catalogueField('silentStationMinutes')!, raw);
      expect(typeof value).not.toBe('number');
      expect(
        ScopedSettingsMutationRequest.safeParse({
          target: { scope: 'event' },
          key: 'silentStationMinutes',
          operation: 'set',
          value,
          expectedVersion: 0,
          reason: 'Reviewed input',
          idempotencyKey: '00000000-0000-4000-8000-000000000001',
        }).success,
      ).toBe(false);
    },
  );
  it('converts only finite numeric proposals and retains valid empty array selection', () => {
    expect(catalogueInputValue(catalogueField('implausibleTapsPerMinute')!, '2.5')).toBe(2.5);
    expect(catalogueInputValue(catalogueField('report.curveBucketMinutes')!, '15')).toBe(15);
    expect(catalogueInputValue(catalogueField('incident.pushSeverities')!, [])).toEqual([]);
    expect(catalogueInputValue(catalogueField('capture.open')!, false)).toBe(false);
    expect(catalogueInputValue(catalogueField('vocabulary.missionCard')!, '  label  ')).toBe(
      '  label  ',
    );
    expect(metadata['vocabulary.missionCard'].jsonSchema).toHaveProperty('maxLength', 40);
  });
});
