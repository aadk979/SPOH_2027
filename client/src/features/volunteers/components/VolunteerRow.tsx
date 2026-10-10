import type { ReactNode } from 'react';
import type { CommitteeRole, VolunteerAdminRecord } from '@spoh/shared';
import { Card } from '@/shared/ui';
import { canActOn } from '../model/canActOn';
import { VolunteerEditor } from './VolunteerEditor';
import { VolunteerRowActions } from './VolunteerRowActions';
import { VolunteerIdentity } from './VolunteerIdentity';

export function VolunteerRow({
  volunteer,
  canManage,
  viewerRole,
  isSelf,
  open,
  onToggle,
}: {
  volunteer: VolunteerAdminRecord;
  canManage: boolean;
  viewerRole: CommitteeRole | undefined;
  isSelf: boolean;
  open: boolean;
  onToggle(): void;
}): ReactNode {
  const actionable = !isSelf && canActOn(viewerRole, volunteer.role);
  return (
    <Card
      variant="flat"
      tone={volunteer.active ? 'neutral' : 'warn'}
      className="flex flex-col gap-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <VolunteerIdentity volunteer={volunteer} isSelf={isSelf} />
        <VolunteerRowActions
          volunteer={volunteer}
          canManage={canManage}
          actionable={actionable}
          isSelf={isSelf}
          open={open}
          onToggle={onToggle}
        />
      </div>
      {!volunteer.active && volunteer.deactivatedReason ? (
        <p className="text-caption text-text-muted">Deactivated: {volunteer.deactivatedReason}</p>
      ) : null}
      {open && canManage && actionable ? <VolunteerEditor volunteer={volunteer} /> : null}
    </Card>
  );
}
