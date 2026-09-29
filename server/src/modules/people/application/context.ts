import type { CommitteeRole } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** The administrator making a change: who, at what rank, and the audit trail. */
export interface ManagerContext {
  volunteerId: string;
  role: CommitteeRole;
  /** The event the change is made in (ADR-001 §2). */
  scope: EventScope;
  audit: AuditContext;
}
