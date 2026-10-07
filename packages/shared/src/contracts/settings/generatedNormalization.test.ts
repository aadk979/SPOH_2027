import { expect, it } from 'vitest';
import {
  GENERATED_SETTING_SCHEMAS as schemas,
  GENERATED_SETTING_METADATA as metadata,
} from '../../generated/settings/index.js';

it.each(['attendance.campusNetworkLabel', 'vocabulary.missionCard'] as const)(
  'validates normalised text and preserves strict value types for %s',
  (key) => {
    const schema = schemas[key],
      maximum = metadata[key].jsonSchema.maxLength;
    for (const invalid of [null, false, 42, [], {}, '', ' ', '\t\n', 'x'.repeat(maximum + 1)])
      expect(schema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(false);
    expect(schema.parse('  Label \t')).toBe('Label');
    expect(schema.parse(`  ${'x'.repeat(maximum)}  `)).toBe('x'.repeat(maximum));
    expect(schema.safeParse(`  ${'x'.repeat(maximum + 1)}  `).success).toBe(false);
  },
);
