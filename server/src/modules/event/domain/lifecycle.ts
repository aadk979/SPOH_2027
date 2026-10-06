import type { EventStatus, GoLiveCheckCode, GoLiveOverride } from '@spoh/shared';
import { goLiveCheckBlockers } from './goLiveChecks.js';
import type { ReadinessItem } from './readiness/index.js';
export { GO_LIVE_CHECKS } from './goLiveChecks.js';

export type { GoLiveCheckCode } from '@spoh/shared';
export interface LifecycleContext {
  now: Date;
  platformAdmin?: boolean;
  reason?: string;
  goLiveOverrides?: readonly GoLiveOverride[];
}
type VerifiedLifecycleContext = LifecycleContext & { platformAdmin: boolean };
export const REOPEN_HOURS = 48;

/** Inputs read before a transition. The evaluator itself has no database or clock. */
export interface LifecycleSnapshot {
  from: EventStatus;
  structure: {
    timezoneValid: boolean;
    eventDays: number;
    shiftTemplates: number;
    stationTypes: number;
    registrationStationTypes: number;
    categories: number;
  };
  /** P13.6 computes these on the server. An absent checklist fails closed. */
  goLiveChecks: ReadonlyArray<{ code: GoLiveCheckCode; passed: boolean }>;
  hasBeenLive: boolean;
  closedAt: Date | null;
  archive: {
    lostPersonPurgeComplete: boolean;
    finalReportExists: boolean;
    captureGracePeriodComplete: boolean;
  };
}

/** Production observations add public checklist data without inventing facts in pure fixtures. */
export type ObservedLifecycleSnapshot = LifecycleSnapshot & {
  goLiveReadiness: readonly ReadinessItem[];
};

export type LifecycleAction =
  | 'Event.MarkReady'
  | 'Event.Rehearse'
  | 'Event.GoLive'
  | 'Event.Close'
  | 'Event.Reopen'
  | 'Event.Archive';

export type LifecycleEffect =
  | 'rehearsal.open'
  | 'rehearsal.close'
  | 'live.open'
  | 'close.freeze'
  | 'close.reopen'
  | 'archive.start';

interface Transition {
  action: LifecycleAction;
  effects: readonly LifecycleEffect[];
  guard: 'structure' | 'never-live' | 'go-live' | 'reopen' | 'archive' | 'none';
}

/** The only legal edges in ADR-004's state machine. */
export const LIFECYCLE_TRANSITIONS: Readonly<
  Record<EventStatus, Partial<Record<EventStatus, Transition>>>
> = {
  DRAFT: { READY: { action: 'Event.MarkReady', effects: [], guard: 'structure' } },
  READY: {
    DRAFT: { action: 'Event.MarkReady', effects: [], guard: 'never-live' },
    REHEARSAL: { action: 'Event.Rehearse', effects: ['rehearsal.open'], guard: 'structure' },
    LIVE: { action: 'Event.GoLive', effects: ['live.open'], guard: 'go-live' },
  },
  REHEARSAL: {
    READY: { action: 'Event.Rehearse', effects: ['rehearsal.close'], guard: 'none' },
  },
  LIVE: { CLOSED: { action: 'Event.Close', effects: ['close.freeze'], guard: 'none' } },
  CLOSED: {
    LIVE: { action: 'Event.Reopen', effects: ['close.reopen'], guard: 'reopen' },
    ARCHIVED: { action: 'Event.Archive', effects: ['archive.start'], guard: 'archive' },
  },
  ARCHIVED: {},
};

export interface TransitionEvaluation {
  from: EventStatus;
  to: EventStatus;
  action: LifecycleAction | null;
  effects: readonly LifecycleEffect[];
  blockers: readonly string[];
  allowed: boolean;
}

function structureBlockers(snapshot: LifecycleSnapshot): string[] {
  const { structure } = snapshot;
  const blockers: string[] = [];
  if (!structure.timezoneValid) blockers.push('timezone');
  if (structure.eventDays < 1) blockers.push('event-days');
  if (structure.shiftTemplates < 1) blockers.push('shift-templates');
  if (structure.stationTypes < 1) blockers.push('station-types');
  if (structure.registrationStationTypes > 0 && structure.categories < 1) {
    blockers.push('categories');
  }
  return blockers;
}

function goLiveBlockers(snapshot: LifecycleSnapshot, context: VerifiedLifecycleContext): string[] {
  return [...structureBlockers(snapshot), ...goLiveCheckBlockers(snapshot.goLiveChecks, context)];
}

function reopenBlockers(snapshot: LifecycleSnapshot, context: VerifiedLifecycleContext): string[] {
  const blockers: string[] = [];
  const elapsed = snapshot.closedAt ? context.now.getTime() - snapshot.closedAt.getTime() : NaN;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > REOPEN_HOURS * 3600_000) {
    blockers.push('reopen-window-expired');
  }
  if (!context.platformAdmin) blockers.push('platform-admin-required');
  if (!context.reason?.trim()) blockers.push('reason-required');
  return blockers;
}

function archiveBlockers(snapshot: LifecycleSnapshot): string[] {
  const blockers: string[] = [];
  if (!snapshot.archive.lostPersonPurgeComplete) blockers.push('lost-person-purge');
  if (!snapshot.archive.finalReportExists) blockers.push('final-report');
  if (!snapshot.archive.captureGracePeriodComplete) blockers.push('capture-grace-period');
  return blockers;
}

const GUARDS: Record<
  Transition['guard'],
  (snapshot: LifecycleSnapshot, context: VerifiedLifecycleContext) => string[]
> = {
  structure: structureBlockers,
  'never-live': (snapshot) => (snapshot.hasBeenLive ? ['already-live'] : []),
  'go-live': goLiveBlockers,
  reopen: reopenBlockers,
  archive: archiveBlockers,
  none: () => [],
};

/** Pure transition decision shared by the write use case and the setup checklist. */
export function evaluateTransition(
  snapshot: LifecycleSnapshot,
  to: EventStatus,
  context: LifecycleContext,
): TransitionEvaluation {
  const edge = LIFECYCLE_TRANSITIONS[snapshot.from][to];
  if (!edge) {
    return {
      from: snapshot.from,
      to,
      action: null,
      effects: [],
      blockers: ['illegal-transition'],
      allowed: false,
    };
  }
  const blockers = GUARDS[edge.guard](snapshot, {
    ...context,
    platformAdmin: context.platformAdmin ?? false,
  });
  if (context.goLiveOverrides?.length && edge.action !== 'Event.GoLive') {
    blockers.push('overrides-only-for-go-live');
  }
  return {
    from: snapshot.from,
    to,
    action: edge.action,
    effects: edge.effects,
    blockers,
    allowed: blockers.length === 0,
  };
}
