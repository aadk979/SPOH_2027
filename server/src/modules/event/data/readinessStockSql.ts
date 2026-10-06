import { Prisma } from '../../../generated/prisma/client.js';

/** Aggregate separately before joining gifts, so adjustments cannot multiply redemptions. */
export const readinessStockRows = Prisma.sql`
  card_batches AS (
    SELECT c."batchLabel", count(*) AS "unissuedCards"
    FROM "MissionCard" c JOIN selected_event e ON c."eventId" = e.id
    WHERE NOT c.rehearsal AND c.status = 'UNISSUED'
    GROUP BY c."batchLabel"
  ), gift_adjustments AS (
    SELECT a."giftTypeId", sum(a.delta) AS adjustment
    FROM "GiftStockAdjustment" a JOIN selected_event e ON a."eventId" = e.id
    WHERE NOT a.rehearsal GROUP BY a."giftTypeId"
  ), gift_redemptions AS (
    SELECT r."giftTypeId", count(*) AS redeemed
    FROM "GiftRedemption" r JOIN selected_event e ON r."eventId" = e.id
    WHERE NOT r.rehearsal AND NOT r.voided GROUP BY r."giftTypeId"
  ), gifts AS (
    SELECT g.id, g.active, g."initialStock", COALESCE(a.adjustment, 0) AS adjustment,
           COALESCE(r.redeemed, 0) AS redeemed, false AS rehearsal
    FROM "GiftType" g JOIN selected_event e ON g."eventId" = e.id
    LEFT JOIN gift_adjustments a ON a."giftTypeId" = g.id
    LEFT JOIN gift_redemptions r ON r."giftTypeId" = g.id
    WHERE g.active
  )
`;

export const readinessCardFacts = Prisma.sql`
  jsonb_build_object('batches', COALESCE((SELECT jsonb_agg(
    jsonb_build_object('batchLabel', c."batchLabel", 'rehearsal', false,
                       'unissuedCards', c."unissuedCards")
    ORDER BY c."batchLabel") FROM card_batches c), '[]'::jsonb))
`;

export const readinessGiftFacts = Prisma.sql`
  jsonb_build_object('gifts', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id)
    FROM gifts g), '[]'::jsonb))
`;
