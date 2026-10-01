import type { EventScope } from './eventScope.js';

/** Inclusion is explicit and travels with the event through every report read. */
export interface ReportingScope extends EventScope {
  includeRehearsal?: boolean;
}

export function rehearsalFilter(scope: ReportingScope): { rehearsal?: false } {
  return scope.includeRehearsal ? {} : { rehearsal: false };
}
