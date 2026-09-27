import type { CommitteeRole } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';

/** The administrator provisioning or importing: who, at what rank, and the audit trail. */
export interface RosterActor {
  volunteerId: string;
  role: CommitteeRole;
  audit: AuditContext;
  /** Holds `user.provision`: may create people, not only edit them (F03-043). */
  mayProvision: boolean;
}
