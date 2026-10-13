import { z } from 'zod';
import { CardShortCode, Id } from '@spoh/shared';

const card = z.object({ version: z.literal(1), cardId: Id, shortCode: CardShortCode });
export const cardReceipt = z.discriminatedUnion('kind', [
  card.extend({ kind: z.literal('ISSUE') }).strict(),
  card.extend({ kind: z.literal('VOID') }).strict(),
  card.extend({
    kind: z.literal('STAMP'), stationId: Id, stampAdded: z.boolean(), justCompleted: z.boolean(),
    warningKind: z.literal('ALREADY_STAMPED').nullable(),
  }).strict(),
  card.extend({
    kind: z.literal('REISSUE'), originalShortCode: CardShortCode, voidedCardId: Id,
    stampsCarriedOver: z.number().int().nonnegative(),
  }).strict(),
]);
export type CardReceipt = z.infer<typeof cardReceipt>;

export function simpleCardReceipt(
  kind: 'ISSUE' | 'VOID',
  existing: { id: string; shortCode: string },
): CardReceipt {
  return { version: 1, kind, cardId: existing.id, shortCode: existing.shortCode };
}

export function stampReceipt(input: {
  cardId: string; shortCode: string; stationId: string; stampAdded: boolean; justCompleted: boolean;
}): CardReceipt {
  return { version: 1, kind: 'STAMP', ...input,
    warningKind: input.stampAdded ? null : 'ALREADY_STAMPED' };
}

export function reissueReceipt(input: {
  cardId: string; shortCode: string; originalShortCode: string; voidedCardId: string;
  stampsCarriedOver: number;
}): CardReceipt {
  return { version: 1, kind: 'REISSUE', ...input };
}
