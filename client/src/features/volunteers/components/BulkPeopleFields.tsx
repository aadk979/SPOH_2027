import type { ReactNode } from 'react';
import { ChoiceGroup, Field, Input, Select } from '@/shared/ui';
import { useAllows } from '@/features/session';
import { ROLE_LABELS } from '../model/roles';
import type { useBulkPeopleDraft } from '../hooks/useBulkPeopleDraft';

export function BulkPeopleFields({
  draft,
}: {
  draft: ReturnType<typeof useBulkPeopleDraft>;
}): ReactNode {
  const allows = useAllows();
  const actions = [
    { value: 'resend' as const, label: 'Resend invites', permission: 'People.Invite' as const },
    {
      value: 'deactivate' as const,
      label: 'Deactivate in this event',
      permission: 'People.Deactivate' as const,
    },
    { value: 'role' as const, label: 'Change roles', permission: 'People.AssignRole' as const },
  ].filter((option) => allows(option.permission));
  return (
    <>
      <ChoiceGroup
        legend="Bulk action"
        name="bulk-action"
        value={draft.form.values.action}
        options={actions}
        onChange={(value) => {
          draft.setReview(null);
          draft.form.setField('action', value);
        }}
      />
      {draft.form.values.action === 'deactivate' ? (
        <Field id="bulk-reason" label="Reason" error={draft.form.errors.reason}>
          {(props) => (
            <Input
              {...props}
              value={draft.form.values.reason}
              maxLength={500}
              onChange={(event) => {
                draft.setReview(null);
                draft.form.setField('reason', event.target.value);
              }}
            />
          )}
        </Field>
      ) : null}
      {draft.form.values.action === 'role' ? (
        <Field id="bulk-role" label="New role" error={draft.form.errors.role}>
          {(props) => (
            <Select
              {...props}
              value={draft.form.values.role}
              onChange={(event) => {
                draft.setReview(null);
                draft.form.setField('role', event.target.value as typeof draft.form.values.role);
              }}
            >
              {ROLE_LABELS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </>
  );
}
