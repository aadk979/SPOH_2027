import { LocalCedarAuthorizer, type Authorizer } from './authorizer/index.js';

let engine: Authorizer | null = null;

/**
 * The engine every policy question goes to, from an enforcement point or a use case's own
 * transaction: the local one until P11.6 gives an environment its policy store.
 */
export function currentAuthorizer(): Authorizer {
  engine ??= new LocalCedarAuthorizer();
  return engine;
}

/** For tests: the engine the enforcement points and use cases ask. */
export function useAuthorizer(next: Authorizer | null): void {
  engine = next;
}

/**
 * Policies about the state of the event or of the caller's own record, which every use case
 * enforces again under its own lock and with the reason the screens show: the capture window
 * and the archived event (`SETTING_LOCKED`, the closing grace for a queued capture, the reopen
 * blockers), and check-in's attendance and running shift (a conflict, not a permission
 * denial). A refusal by these alone is left to the use case.
 */
export const USE_CASE_PHASE_GUARDRAILS: ReadonlySet<string> = new Set([
  'guardrail.capture-window',
  'guardrail.archived-read-only',
  'self.check-in-conditions',
]);
