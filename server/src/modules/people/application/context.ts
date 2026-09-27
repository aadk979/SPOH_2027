import type { CommitteeRole } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';

/** The administrator making a change: who, at what rank, and the audit trail. */
export interface ManagerContext {
  volunteerId: string;
  role: CommitteeRole;
  audit: AuditContext;
}
