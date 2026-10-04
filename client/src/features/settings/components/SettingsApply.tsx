import type { ReactNode } from 'react';
import type { SettingsForm } from '../hooks/useSettingsForm';
import { Button, Card, CardTitle } from '@/shared/ui';

export function SettingsApply({
  form,
  canEdit,
}: {
  form: SettingsForm;
  canEdit: boolean;
}): ReactNode {
  const { save, onSave, settings } = form;
  return (
    <>
      {canEdit ? (
        <Card className="flex flex-col gap-sm">
          <CardTitle as="h3">Apply</CardTitle>
          <p className="text-caption text-text-muted">
            Recorded in the audit log against your name, with the previous value.
          </p>
          <Button size="lg" block disabled={!form.canSave} onClick={onSave}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </Card>
      ) : null}
      {settings.data?.updatedByName ? (
        <p className="text-caption text-text-muted">
          Last changed by {settings.data.updatedByName}.
        </p>
      ) : null}
    </>
  );
}
