import type { AuditContext } from '../../../platform/audit/index.js';

export interface PlatformEventActor {
  personId: string;
  sub: string;
  audit: AuditContext;
}
