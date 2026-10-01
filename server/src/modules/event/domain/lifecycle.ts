import type { EventStatus } from '@spoh/shared';

/** P13.6 supplies every result before go-live can be considered. */
export const GO_LIVE_CHECKS = [
  'shift-coverage',
  'categories',
  'card-batch',
  'gift-stock',
  'content',
  'attendance',
  'role-permissions',
  'notifications',
  'staging-smoke',
  'backups',
  'alarms',
] as const;
export type GoLiveCheckCode = (typeof GO_LIVE_CHECKS)[number];

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

function goLiveBlockers(snapshot: LifecycleSnapshot): string[] {
  const blockers = structureBlockers(snapshot);
  if (snapshot.goLiveChecks.length === 0) return [...blockers, 'go-live-checklist-unavailable'];
  const checks = new Map(snapshot.goLiveChecks.map((check) => [check.code, check.passed]));
  for (const code of GO_LIVE_CHECKS) {
    if (!checks.has(code)) blockers.push(`go-live:${code}:missing`);
    else if (!checks.get(code)) blockers.push(`go-live:${code}`);
  }
  return blockers;
}

function reopenBlockers(
  snapshot: LifecycleSnapshot,
  context: { now: Date; platformAdmin: boolean; reason?: string },
): string[] {
  const blockers: string[] = [];
  const elapsed = snapshot.closedAt ? context.now.getTime() - snapshot.closedAt.getTime() : NaN;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 48 * 3600_000) {
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
  (
    snapshot: LifecycleSnapshot,
    context: { now: Date; platformAdmin: boolean; reason?: string },
  ) => string[]
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
  context: { now: Date; platformAdmin?: boolean; reason?: string },
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
  return {
    from: snapshot.from,
    to,
    action: edge.action,
    effects: edge.effects,
    blockers,
    allowed: blockers.length === 0,
  };
}
