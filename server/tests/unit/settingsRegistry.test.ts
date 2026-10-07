import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  GENERATED_SETTING_DEFAULTS,
  GENERATED_SETTING_METADATA,
  GENERATED_SETTING_SCHEMAS,
} from '@spoh/shared';
import { SETTINGS } from '../../src/platform/settings/registry.js';

type JsonSchema = Record<string, unknown>;

function hasBounds(schema: JsonSchema): boolean {
  if ('const' in schema || Array.isArray(schema.enum)) return true;
  if (Array.isArray(schema.oneOf)) return schema.oneOf.every((part) => hasBounds(part));
  if (Array.isArray(schema.anyOf)) return schema.anyOf.every((part) => hasBounds(part));
  if (schema.type === 'boolean' || schema.type === 'null') return true;
  if (schema.type === 'number' || schema.type === 'integer') {
    return typeof schema.minimum === 'number' && typeof schema.maximum === 'number';
  }
  if (schema.type === 'string') {
    return typeof schema.maxLength === 'number';
  }
  if (schema.type === 'array') {
    return typeof schema.maxItems === 'number' && hasBounds(schema.items as JsonSchema);
  }
  if (schema.type === 'object') {
    return (
      schema.additionalProperties === false &&
      Object.values(schema.properties as Record<string, JsonSchema>).every(hasBounds)
    );
  }
  return false;
}

describe('settings registry and generated contracts (P10.1)', () => {
  it('keeps generated trim normalisation and length validation identical to the authored registry', () => {
    for (const [key, definition] of Object.entries(SETTINGS)) {
      if (definition.normalise !== 'trim') continue;
      const maximum = (z.toJSONSchema(definition.schema) as JsonSchema).maxLength as number;
      for (const input of [
        null,
        42,
        '',
        ' ',
        '\t\n',
        'Label',
        'x'.repeat(maximum),
        `  ${'x'.repeat(maximum)}  `,
        `  ${'x'.repeat(maximum + 1)}  `,
      ]) {
        const authored = definition.schema.safeParse(input);
        const generated =
          GENERATED_SETTING_SCHEMAS[key as keyof typeof GENERATED_SETTING_SCHEMAS].safeParse(input);
        expect(generated.success, `${key}: ${JSON.stringify(input)}`).toBe(authored.success);
        if (authored.success && generated.success) expect(generated.data).toEqual(authored.data);
      }
    }
  });
  it('gives every key copy, scope, action, a valid default and finite validation', () => {
    for (const [key, definition] of Object.entries(SETTINGS)) {
      expect(definition.key).toBe(key);
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(20);
      expect(definition.group.length).toBeGreaterThan(0);
      expect(definition.scopes.length).toBeGreaterThan(0);
      expect(definition.requiredAction.length).toBeGreaterThan(0);
      expect(definition.schema.safeParse(definition.default).success, key).toBe(true);
      expect(hasBounds(z.toJSONSchema(definition.schema) as JsonSchema), key).toBe(true);
    }
  });

  it('generates the same keys, defaults and bounded schemas for both packages', () => {
    const keys = Object.keys(SETTINGS).sort();
    expect(Object.keys(GENERATED_SETTING_METADATA).sort()).toEqual(keys);
    expect(Object.keys(GENERATED_SETTING_SCHEMAS).sort()).toEqual(keys);
    expect(Object.keys(GENERATED_SETTING_DEFAULTS).sort()).toEqual(keys);
    for (const key of keys) {
      const definition = SETTINGS[key as keyof typeof SETTINGS];
      expect(GENERATED_SETTING_DEFAULTS[key as keyof typeof GENERATED_SETTING_DEFAULTS]).toEqual(
        definition.default,
      );
      expect(
        GENERATED_SETTING_SCHEMAS[key as keyof typeof GENERATED_SETTING_SCHEMAS].safeParse(
          definition.default,
        ).success,
        key,
      ).toBe(true);
    }
    expect(GENERATED_SETTING_SCHEMAS.alertPollSeconds.safeParse(31).success).toBe(false);
  });
});
