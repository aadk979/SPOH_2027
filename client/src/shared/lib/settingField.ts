import { z } from 'zod';
import {
  GENERATED_SETTING_METADATA as metadata,
  GENERATED_SETTING_SCHEMAS as schemas,
  type ScopedOperationalSettingKey,
} from '@spoh/shared';

export type CatalogueField =
  | { kind: 'boolean' }
  | { kind: 'text'; minimum: number; maximum: number }
  | { kind: 'number'; minimum: number; maximum: number; step: 1 | 'any' }
  | { kind: 'choice'; options: number[] }
  | { kind: 'multiple'; options: string[]; maximum: number };
export type CatalogueInput = string | boolean | string[];

const numberSchema = z
  .object({
    type: z.enum(['number', 'integer']),
    minimum: z.number().finite(),
    maximum: z.number().finite(),
  })
  .refine(({ minimum, maximum }) => minimum <= maximum);
const textSchema = z
  .object({
    type: z.literal('string'),
    minLength: z.number().int().nonnegative(),
    maxLength: z.number().int().positive(),
  })
  .refine(({ minLength, maxLength }) => minLength <= maxLength);
const multipleSchema = z.object({
  type: z.literal('array'),
  maxItems: z.number().int().nonnegative(),
  items: z.object({ type: z.literal('string'), enum: z.array(z.string()).min(1) }),
});
const choiceSchema = z.object({
  anyOf: z.array(z.object({ type: z.literal('number'), const: z.number().finite() })).min(1),
});

/** Unsupported registry shapes offer no writer; shared request validation remains authoritative. */
export function catalogueFieldFromSchema(schema: unknown): CatalogueField | null {
  if (z.object({ type: z.literal('boolean') }).safeParse(schema).success)
    return { kind: 'boolean' };
  const number = numberSchema.safeParse(schema);
  if (number.success)
    return {
      kind: 'number',
      minimum: number.data.minimum,
      maximum: number.data.maximum,
      step: number.data.type === 'integer' ? 1 : 'any',
    };
  const text = textSchema.safeParse(schema);
  if (text.success)
    return { kind: 'text', minimum: text.data.minLength, maximum: text.data.maxLength };
  const multiple = multipleSchema.safeParse(schema);
  if (multiple.success)
    return {
      kind: 'multiple',
      options: multiple.data.items.enum,
      maximum: multiple.data.maxItems,
    };
  const choice = choiceSchema.safeParse(schema);
  return choice.success
    ? { kind: 'choice', options: choice.data.anyOf.map((item) => item.const) }
    : null;
}
export function catalogueField(key: ScopedOperationalSettingKey) {
  return catalogueFieldFromSchema(metadata[key].jsonSchema);
}
export function catalogueInputValue(field: CatalogueField, raw: CatalogueInput) {
  if ((field.kind === 'number' || field.kind === 'choice') && typeof raw === 'string') {
    const value = raw.trim() ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : raw;
  }
  return raw;
}
export function catalogueProposedValue(key: ScopedOperationalSettingKey, raw: CatalogueInput) {
  const field = catalogueField(key);
  if (!field) return null;
  const parsed = schemas[key].safeParse(catalogueInputValue(field, raw));
  return parsed.success ? parsed.data : null;
}
export function catalogueFieldHint(
  field: Exclude<CatalogueField, { kind: 'boolean' | 'multiple' }>,
) {
  if (field.kind === 'choice') return 'Select one of the registered values.';
  if (field.kind === 'text')
    return `Use ${field.minimum} to ${field.maximum} characters after trimming.`;
  return `Enter ${field.step === 1 ? 'a whole number' : 'a number'} from ${field.minimum} to ${field.maximum}.`;
}
