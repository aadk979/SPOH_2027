import { createHash } from 'node:crypto';
import { WRITE_ACTION_IDS, type Action } from '@spoh/access-policies';
import type { CacheChannel } from '../../events/cacheBus.js';
import type { AuthorizationDecision, AuthorizationRequest } from './types.js';

/**
 * AVP decisions, per instance (ADR-005 §6). The key is a hash of the complete
 * evaluation input: principal, action, resource, context and every entity attribute,
 * including the membership's role grants, stations on shift and the event phase. A
 * decision is a function of that input and the deployed policies, so no change of
 * role, shift, phase or grant can be served a stale answer: it is a different key.
 * The `access` and `membership` channels still clear an event's entries at once, and
 * entries live 30 s for writes and 60 s for reads.
 */
export interface DecisionCacheOptions {
  readonly writeTtlMs?: number;
  readonly readTtlMs?: number;
  readonly maxEntries?: number;
  readonly now?: () => number;
}

interface Entry {
  readonly decision: AuthorizationDecision;
  readonly eventId: string | null;
  readonly expiresAt: number;
}

const WRITES = new Set<Action>(WRITE_ACTION_IDS);

/** The bus channels that change who may do what. */
export const DECISION_CACHE_CHANNELS: readonly CacheChannel[] = ['access', 'membership'];

/** Object keys sorted, so equal inputs hash equally whatever order they were built in. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  }
  return value;
}

export function decisionKey(request: AuthorizationRequest): string {
  const { principal, action, resource, context, entities } = request;
  return createHash('sha256')
    .update(JSON.stringify(canonical({ principal, action, resource, context, entities })))
    .digest('base64url');
}

export class DecisionCache {
  private readonly writeTtlMs: number;
  private readonly readTtlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry>();

  constructor(options: DecisionCacheOptions = {}) {
    this.writeTtlMs = options.writeTtlMs ?? 30_000;
    this.readTtlMs = options.readTtlMs ?? 60_000;
    this.maxEntries = options.maxEntries ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  get(request: AuthorizationRequest): AuthorizationDecision | undefined {
    const key = decisionKey(request);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.decision;
  }

  /** Only clean answers are kept; a decision with evaluation errors is asked again. */
  set(request: AuthorizationRequest, decision: AuthorizationDecision): void {
    if (decision.errors.length > 0) return;
    const key = decisionKey(request);
    const ttl = WRITES.has(request.action) ? this.writeTtlMs : this.readTtlMs;
    this.entries.delete(key);
    this.entries.set(key, { decision, eventId: request.eventId, expiresAt: this.now() + ttl });
    // A Map iterates in insertion order, so the first key is the oldest entry.
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** One event's decisions, or every decision when the message names no event. */
  invalidate(eventId?: string): void {
    if (eventId === undefined) {
      this.entries.clear();
      return;
    }
    for (const [key, entry] of this.entries) {
      if (entry.eventId === eventId || entry.eventId === null) this.entries.delete(key);
    }
  }

  /** Listen on the bus channels that change permissions. */
  subscribe(
    subscribe: (
      channel: CacheChannel,
      listener: (payload: Record<string, unknown>) => void,
    ) => void,
  ): void {
    for (const channel of DECISION_CACHE_CHANNELS) {
      subscribe(channel, (payload) => {
        this.invalidate(typeof payload.eventId === 'string' ? payload.eventId : undefined);
      });
    }
  }
}
