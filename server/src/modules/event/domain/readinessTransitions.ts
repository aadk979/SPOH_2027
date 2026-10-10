import type { EventStatus, LifecycleTransitionOption } from '@spoh/shared';
import {
  evaluateTransition,
  LIFECYCLE_TRANSITIONS,
  type LifecycleContext,
  type LifecycleSnapshot,
} from './lifecycle.js';

/** Advisory and mutation share the same current evidence and authority guard table. */
export function readinessTransitions(
  snapshot: LifecycleSnapshot,
  context: LifecycleContext,
): LifecycleTransitionOption[] {
  const targets = Object.keys(LIFECYCLE_TRANSITIONS[snapshot.from]) as EventStatus[];
  return targets.map((to) => {
    const decision = evaluateTransition(snapshot, to, context);
    const requiresReason = decision.action === 'Event.Reopen';
    const blockers = decision.blockers.filter((code) => code !== 'reason-required');
    return { to, requiresReason, blockers, allowed: blockers.length === 0 };
  });
}
