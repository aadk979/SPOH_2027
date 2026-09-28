import { type ReactNode } from 'react';
import { type VolunteerAdminRecord } from '@spoh/shared';

import { Button } from '@/shared/ui';

import { StatusChip } from './StatusChip';
export function VolunteerRowActions({
  volunteer,
  canManage,
  actionable,
  isSelf,
  open,
  onToggle,
}: {
  volunteer: VolunteerAdminRecord;
  canManage: boolean;
  actionable: boolean;
  isSelf: boolean;
  open: boolean;
  onToggle(): void;
}): ReactNode {
  return (
    <div className="flex items-center gap-sm">
      <StatusChip volunteer={volunteer} />
      {canManage && actionable ? (
        <Button variant="quiet" size="sm" onClick={onToggle} aria-expanded={open}>
          {open ? 'Close' : 'Manage'}
        </Button>
      ) : canManage ? (
        <span className="text-caption text-text-subtle whitespace-nowrap">
          {isSelf ? 'Your account' : 'Above your level'}
        </span>
      ) : null}
    </div>
  );
}
