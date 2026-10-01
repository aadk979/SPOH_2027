import {
  ERROR_CODES,
  type CommitteeRole,
  type VisitorFieldType,
  type VisitorValues,
} from '@spoh/shared';
import { RuleError } from '../../../platform/errors/index.js';

const SHAPES: Record<VisitorFieldType, RegExp> = {
  text: /^[\s\S]{1,200}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[0-9 ()-]{6,20}$/,
  number: /^-?\d+(\.\d+)?$/,
};

function refused(message: string): RuleError {
  return new RuleError(ERROR_CODES.VISITOR_DATA_REFUSED, message);
}

/** Visitor values are accepted in allowlist mode only. */
export function assertAllowlist(mode: 'none' | 'allowlist'): void {
  if (mode !== 'allowlist') throw refused('This event keeps no visitor details.');
}

/**
 * The values to store: each one a declared, active field of the right shape,
 * blanks dropped. Anything else refuses the whole capture, so a value is
 * never half-kept (ADR-002 §4).
 */
export function acceptedValues(
  fields: ReadonlyArray<{ code: string; label: string; type: string; active: boolean }>,
  values: VisitorValues,
): Record<string, string> {
  const byCode = new Map(
    fields.filter((field) => field.active).map((field) => [field.code, field]),
  );
  const accepted: Record<string, string> = {};
  for (const [code, raw] of Object.entries(values)) {
    const field = byCode.get(code);
    if (!field) throw refused(`This event does not collect "${code}".`);
    const value = raw.trim();
    if (!value) continue;
    const shape = SHAPES[field.type as VisitorFieldType] ?? SHAPES.text;
    if (!shape.test(value)) throw refused(`${field.label} is not a valid ${field.type}.`);
    accepted[code] = value;
  }
  return accepted;
}

/** The fields a role may read: their values are the only ones it is shown. */
export function readableBy<Field extends { readers: readonly CommitteeRole[] }>(
  fields: readonly Field[],
  role: CommitteeRole,
): Field[] {
  return fields.filter((field) => field.readers.includes(role));
}

/** Fields whose retention after the event closed has run out. */
export function expiredFields<Field extends { retentionDays: number }>(
  fields: readonly Field[],
  closedAt: Date,
  now: Date,
): Field[] {
  return fields.filter(
    (field) => closedAt.getTime() + field.retentionDays * 86_400_000 <= now.getTime(),
  );
}
