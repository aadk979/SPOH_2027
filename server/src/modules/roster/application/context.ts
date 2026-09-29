import type { CommitteeRole } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** The administrator provisioning or importing: who, at what rank, and the audit trail. */
export interface RosterActor {
  volunteerId: string;
  role: CommitteeRole;
  /** The event the change is made in (ADR-001 §2). */
  scope: EventScope;
  audit: AuditContext;
  /** Holds `user.provision`: may create people, not only edit them (F03-043). */
  mayProvision: boolean;
}
