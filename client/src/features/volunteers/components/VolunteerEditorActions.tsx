import { type ReactNode } from 'react';
import { type VolunteerAdminRecord } from '@spoh/shared';

import { Button } from '@/shared/ui';

import type { VolunteerEditorState } from '../hooks/useVolunteerEditor';
export function VolunteerEditorActions({
  volunteer,
  form,
}: {
  volunteer: VolunteerAdminRecord;
  form: VolunteerEditorState;
}): ReactNode {
  const { pending, update, reactivate, role, phone, portfolio } = form;
  return (
    <>
      <div className="flex flex-wrap gap-sm">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            update.mutate({
              id: volunteer.id,
              patch: {
                role,
                phone: phone.trim() || null,
                portfolio: portfolio.trim() || null,
              },
            })
          }
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>

        {volunteer.active ? null : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => reactivate.mutate(volunteer.id)}
          >
            Restore access
          </Button>
        )}
      </div>
    </>
  );
}
