import type { ShiftRef } from '@spoh/shared';
import type { Prisma } from '../../generated/prisma/client.js';

/** What a shift is called and when it runs: the reference every contract carries (ADR-002). */
export const SHIFT_REF_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  template: { select: { code: true, label: true } },
} satisfies Prisma.ShiftSelect;

export type ShiftRefRow = Prisma.ShiftGetPayload<{ select: typeof SHIFT_REF_SELECT }>;

export function toShiftRef(shift: ShiftRefRow): ShiftRef {
  return {
    id: shift.id,
    code: shift.template.code,
    label: shift.template.label,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
  };
}
