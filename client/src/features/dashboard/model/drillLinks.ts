import type { DashboardWindow, FunnelStage, Headline, RecordsFilter } from '@spoh/shared';
import { recordsPath } from '@/shared/lib/workspacePath';

type CaptureExtra = { stationId?: string; personId?: string; categoryCode?: string; source?: 'APP' | 'FALLBACK_SHEET' | 'PAPER' | 'MANUAL_ADJUSTMENT' };
const captures = (window: DashboardWindow) => ({ from: window.from, asOf: window.asOf, includeRehearsal: window.includeRehearsal, voided: false });

export function registrationsLink(window: DashboardWindow | undefined, extra: CaptureExtra = {}): string | undefined {
  return window ? recordsPath({ kind: 'registrations', ...captures(window), ...extra }) : undefined;
}
export function lastHourLink(window: DashboardWindow | undefined): string | undefined {
  return window ? recordsPath({ kind: 'registrations', from: new Date(new Date(window.asOf).getTime() - 60 * 60_000).toISOString(), asOf: window.asOf, includeRehearsal: window.includeRehearsal, voided: false }) : undefined;
}
export function footfallLink(window: DashboardWindow | undefined, extra: Omit<CaptureExtra, 'categoryCode'> = {}): string | undefined {
  return window ? recordsPath({ kind: 'footfall', ...captures(window), ...extra }) : undefined;
}
export function countedRoomsLink(window: DashboardWindow | undefined): string | undefined {
  return window ? recordsPath({ kind: 'footfall', ...captures(window), countedStationsOnly: true }) : undefined;
}
type FunnelObservation = { from?: string; to?: string; asOf: string; includeRehearsal: boolean };
export function cardStageLink(stage: Pick<FunnelStage, 'metric' | 'stationId'>, observation: FunnelObservation | undefined): string | undefined {
  if (!observation || !stage.metric || (stage.metric === 'station' && !stage.stationId)) return undefined;
  return recordsPath({ kind: 'cards', ...observation, stage: stage.metric, stationId: stage.metric === 'station' ? stage.stationId : undefined });
}
export function todayCardLink(window: DashboardWindow | undefined, stage: 'issued' | 'completed'): string | undefined {
  return window ? cardStageLink({ metric: stage }, { from: window.from, asOf: window.asOf, includeRehearsal: window.includeRehearsal }) : undefined;
}
export function headlineLink(headline: Headline | null, window: DashboardWindow | undefined): string | undefined {
  if (!headline) return undefined;
  switch (headline.source.count) {
    case 'registrations': return registrationsLink(window);
    case 'journeys': return todayCardLink(window, 'issued');
    case 'footfall': return footfallLink(window, { stationId: headline.source.stationId });
  }
}
export function staffingLink(window: DashboardWindow | undefined, state: 'running' | 'checkedIn' | 'gaps', extra: { stationId?: string; shiftId?: string } = {}): string | undefined {
  if (!window) return undefined;
  const predicate = state === 'running' ? { running: true } : state === 'gaps' ? { coverageGap: true } : { date: window.date, checkedIn: true, checkedOut: false };
  return recordsPath({ kind: 'assignments', asOf: window.asOf, ...predicate, ...extra });
}
export function giftLedgerLink(giftTypeId: string, rehearsal: boolean | undefined, asOf: string): string | undefined {
  return rehearsal === undefined ? undefined : recordsPath({ kind: 'gift-ledger', giftTypeId, rehearsal, asOf });
}
export function giftRedemptionsLink(giftTypeId: string, rehearsal: boolean | undefined, asOf: string): string | undefined {
  return rehearsal === undefined ? undefined : recordsPath({ kind: 'redemptions', giftTypeId, rehearsal, voided: false, asOf });
}
export function recordsLink(filter: RecordsFilter): string { return recordsPath(filter); }
