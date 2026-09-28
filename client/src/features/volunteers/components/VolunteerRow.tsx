import { type ReactNode } from 'react';
import { type CommitteeRole, type VolunteerAdminRecord } from '@spoh/shared';

import { Card } from '@/shared/ui';

import { roleLabel } from '@/features/volunteers';

import { canActOn } from '../model/canActOn';
import { VolunteerEditor } from './VolunteerEditor';
import { VolunteerRowActions } from './VolunteerRowActions';
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
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {volunteer.displayName}
            {isSelf ? <span className="ml-xs text-caption text-text-muted">(you)</span> : null}
          </p>
          <p className="truncate text-caption text-text-muted">
            {volunteer.email} · {roleLabel(volunteer.role)}
            {volunteer.portfolio ? ` · ${volunteer.portfolio}` : ''}
          </p>
        </div>

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
