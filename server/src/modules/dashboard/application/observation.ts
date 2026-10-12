import type { DashboardWindow } from '@spoh/shared';
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';
export function dashboardObservation(scope: ReportingScope, input: { today: Date; since: Date; now: Date }): DashboardWindow {
  return { date: input.today.toISOString().slice(0, 10), from: input.since.toISOString(),
    asOf: input.now.toISOString(), includeRehearsal: scope.includeRehearsal ?? false };
}
