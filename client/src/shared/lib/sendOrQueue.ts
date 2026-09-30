'use client';

import { isRetryable } from '@/shared/lib/api';
import { enqueue } from '@/shared/lib/outbox';

export type SendOrQueueResult<T> = { status: 'sent'; response: T } | { status: 'queued' };

/**
 * Online first, the outbox when the network fails (ADR-007 §5, F03-034).
 *
 * For captures whose answer the screen wants now (the card's journey, the
 * stock left) but which must not be lost offline. The request is sent with the
 * idempotency key it keeps in the queue, so a send that timed out after the
 * server recorded it collapses to one row on replay. A refusal (4xx) is not
 * queued: it would fail the same way forever.
 */
export async function sendOrQueue<T>(request: {
  eventId: string;
  /** The path inside the event the queue sends to: `/gifts/redemptions`. */
  path: string;
  body: { idempotencyKey: string };
  /** What the queue sends later, when it differs from the online body. */
  queuedBody?: unknown;
  send(): Promise<T>;
}): Promise<SendOrQueueResult<T>> {
  try {
    return { status: 'sent', response: await request.send() };
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await enqueue({
      idempotencyKey: request.body.idempotencyKey,
      eventId: request.eventId,
      path: request.path,
      body: request.queuedBody ?? request.body,
    });
    return { status: 'queued' };
  }
}
