'use client';

import { useState } from 'react';
import type { z } from 'zod';

export type FormErrors = Record<string, string | undefined>;

/**
 * Schema paths (dotted) whose errors belong to a differently named editable field.
 * A path also covers everything beneath it: `rows` claims `rows.3.count`.
 */
export type ErrorFields<Values> = Readonly<Record<string, keyof Values & string>>;

function clearFieldErrors(errors: FormErrors, key: string): FormErrors {
  return Object.fromEntries(Object.entries(errors).filter(([path]) =>
    path !== key && path !== '_form' && !path.startsWith(`${key}.`)));
}

function fieldFor(path: string, errorFields: Record<string, string>): string {
  for (let prefix = path; prefix; prefix = prefix.slice(0, Math.max(prefix.lastIndexOf('.'), 0))) {
    const field = errorFields[prefix];
    if (field) return field;
  }
  return path || '_form';
}

function issueMessages(
  issues: z.core.$ZodIssue[],
  errorFields: Record<string, string>,
): FormErrors {
  const errors: FormErrors = {};
  for (const issue of issues) {
    errors[fieldFor(issue.path.join('.'), errorFields)] ??= issue.message;
  }
  return errors;
}

/**
 * One form pattern (ADR-007 §2): editable values in one object, validated by the
 * `@spoh/shared` request schema the server uses, so the messages match.
 *
 * Editable values stay as typed; only the parsed request crosses the API boundary.
 * An error is keyed by its schema path unless `errorFields` maps it to the field
 * the user edits (`target.stationId` → `stationId`), so editing that field clears it.
 */
export function useZodForm<Schema extends z.ZodType, Values extends object>(
  schema: Schema,
  initialValues: Values,
  errorFields: ErrorFields<Values> = {},
) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});

  function setField<Key extends keyof Values>(key: Key, value: Values[Key]): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => clearFieldErrors(current, String(key)));
  }

  /** For values changed by repeated taps: applies to the latest value, not this render's. */
  function updateField<Key extends keyof Values>(
    key: Key,
    update: (current: Values[Key]) => Values[Key],
  ): void {
    setValues((current) => ({ ...current, [key]: update(current[key]) }));
    setErrors((current) => clearFieldErrors(current, String(key)));
  }

  function setter<Key extends keyof Values>(key: Key): (value: Values[Key]) => void {
    return (value) => setField(key, value);
  }

  function validate(input: unknown = values): z.output<Schema> | null {
    const result = schema.safeParse(input);
    setErrors(result.success ? {} : issueMessages(result.error.issues, errorFields));
    return result.success ? result.data : null;
  }

  function reset(next: Values = initialValues): void {
    setValues(next);
    setErrors({});
  }

  return { values, errors, setField, updateField, setter, validate, reset };
}
