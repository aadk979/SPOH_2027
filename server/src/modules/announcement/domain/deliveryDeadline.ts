/** A retry cannot extend the message's original push-service lifetime. */
export function deliveryDeadlineMs(
  source: { createdAt: Date; expiresAt: Date | null },
  ttlSeconds: number,
): number {
  return Math.min(
    source.createdAt.getTime() + ttlSeconds * 1000,
    source.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
  );
}
