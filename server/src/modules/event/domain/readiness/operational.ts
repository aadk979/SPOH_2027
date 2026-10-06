import { CommitteeRole, MembershipStatus } from '@spoh/shared';
import { z } from 'zod';
import {
  fromFailures,
  itemEvaluator,
  ReadinessCount,
  ReadinessId,
  ReadinessInstant,
  unavailable,
} from './contract.js';

export const CategoryFacts = z.object({ activeCategories: ReadinessCount }).strict();
export const evaluateCategories = itemEvaluator('categories', CategoryFacts, (facts) =>
  fromFailures(facts.activeCategories > 0 ? [] : ['categories-empty']),
);

/** batchLabel and provenance exist on MissionCard; only usable live cards count. */
export const CardBatchFacts = z
  .object({
    batches: z.array(
      z
        .object({
          batchLabel: z.string().nullable(),
          rehearsal: z.boolean(),
          unissuedCards: ReadinessCount,
        })
        .strict(),
    ),
  })
  .strict();
export const evaluateCardBatch = itemEvaluator('card-batch', CardBatchFacts, (facts) =>
  fromFailures(
    facts.batches.some(
      (batch) => !batch.rehearsal && batch.batchLabel?.trim() && batch.unissuedCards > 0,
    )
      ? []
      : ['live-card-batch-missing'],
  ),
);

/** Readers supply live aggregates, excluding voided redemptions and practice stock. */
export const GiftStockFacts = z
  .object({
    gifts: z.array(
      z
        .object({
          id: ReadinessId,
          active: z.boolean(),
          initialStock: ReadinessCount,
          adjustment: z.number().int(),
          redeemed: ReadinessCount,
          rehearsal: z.literal(false),
        })
        .strict(),
    ),
  })
  .strict();
export const evaluateGiftStock = itemEvaluator('gift-stock', GiftStockFacts, (facts) => {
  const active = facts.gifts.filter((gift) => gift.active);
  if (!active.length) return fromFailures(['gift-types-empty']);
  return fromFailures(
    active.every((gift) => gift.initialStock + gift.adjustment - gift.redeemed > 0)
      ? []
      : ['live-gift-stock-empty'],
  );
});

/** Publication evidence will come from the content domain, never draft data or the browser. */
export const ContentFacts = z
  .object({
    requiredKeys: z.array(ReadinessId).min(1),
    documents: z.array(
      z
        .object({
          key: ReadinessId,
          publishedVersion: ReadinessId.nullable(),
          publishedAtMs: ReadinessInstant.nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export const evaluateContent = itemEvaluator('content', ContentFacts, (facts, context) => {
  if (
    facts.documents.some(
      (document) =>
        document.publishedAtMs !== null && document.publishedAtMs > context.evaluatedAtMs,
    )
  ) {
    return unavailable('evidence-future');
  }
  const published = new Set(
    facts.documents
      .filter((document) => document.publishedVersion !== null && document.publishedAtMs !== null)
      .map((document) => document.key),
  );
  return fromFailures(
    facts.requiredKeys.every((key) => published.has(key)) ? [] : ['content-unpublished'],
  );
});

/** EventMembership is current standing; Person has no independent active flag (P09). */
export const AttendanceFacts = z
  .object({
    root: z.object({ role: CommitteeRole, status: MembershipStatus }).strict().nullable(),
    validatedTrustedNetworks: ReadinessCount,
  })
  .strict();
export const evaluateAttendance = itemEvaluator('attendance', AttendanceFacts, (facts) => {
  const reasons: string[] = [];
  if (facts.root?.role !== 'ADMIN' || facts.root.status !== 'ACTIVE') {
    reasons.push('attendance-root-invalid');
  }
  if (!facts.validatedTrustedNetworks) reasons.push('attendance-networks-empty');
  return fromFailures(reasons);
});

export const RolePermissionFacts = z
  .object({
    grantsVersion: ReadinessCount,
    reviewedGrantsVersion: ReadinessCount.nullable(),
    reviewedAtMs: ReadinessInstant.nullable(),
  })
  .strict();
export const evaluateRolePermissions = itemEvaluator(
  'role-permissions',
  RolePermissionFacts,
  (facts, context) => {
    if (facts.reviewedAtMs !== null && facts.reviewedAtMs > context.evaluatedAtMs)
      return unavailable('evidence-future');
    return fromFailures(
      facts.reviewedAtMs !== null && facts.reviewedGrantsVersion === facts.grantsVersion
        ? []
        : ['role-permissions-unreviewed'],
    );
  },
);

/** Configuration does not claim successful device delivery or acknowledge user receipt. */
export const NotificationFacts = z
  .object({ transportConfigured: z.boolean(), settingsValid: z.boolean() })
  .strict();
export const evaluateNotifications = itemEvaluator('notifications', NotificationFacts, (facts) =>
  fromFailures(
    facts.transportConfigured && facts.settingsValid ? [] : ['notifications-unconfigured'],
  ),
);
