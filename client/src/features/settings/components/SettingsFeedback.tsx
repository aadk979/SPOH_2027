import type { ReactNode } from 'react';
import type { SettingsForm } from '../hooks/useSettingsForm';
import { Callout } from '@/shared/ui';
import { ApiError } from '@/shared/lib/apiErrors';
export function SettingsFeedback({
  form,
  canEdit,
}: {
  form: SettingsForm;
  canEdit: boolean;
}): ReactNode {
  const { hasErrors, save } = form;
  return (
    <>
      {!canEdit ? (
        <Callout tone="info">
          These are the values the event is currently running on. Changing them is Chief and Admin
          only.
        </Callout>
      ) : null}
      {form.settings.isError ? (
        <Callout tone="alert" role="alert" title="Settings unavailable">
          Current settings could not be loaded. Refresh before saving.
        </Callout>
      ) : null}
      {hasErrors ? (
        <Callout tone="alert" role="alert" title="Invalid input">
          Nothing was saved. Correct the highlighted values and save again.
        </Callout>
      ) : null}
      {save.isError ? (
        <Callout tone="alert" role="alert" title="Not saved">
          {save.error instanceof ApiError ? save.error.message : 'Try again in a moment.'}
        </Callout>
      ) : null}
      {save.isSuccess ? (
        <Callout tone="ok" role="status">
          Saved. Every server picks this up within a minute; this one already has.
        </Callout>
      ) : null}
    </>
  );
}
