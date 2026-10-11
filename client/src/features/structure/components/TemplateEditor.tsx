import type { FormEvent } from 'react';
import {
  CreateManagedTemplateRequest,
  UpdateManagedTemplateRequest,
  type ManagedShiftTemplate,
} from '@spoh/shared';
import { templateValues } from '../model/editorDefaults';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Checkbox, Stack } from '@/shared/ui';
import { useStructureWrite } from '../queries';
import { useAllows } from '@/features/session';
import { EditorField } from './EditorField';
import { WriteFeedback } from './WriteFeedback';
export function TemplateEditor({
  record,
  editable = true,
}: {
  record?: ManagedShiftTemplate;
  editable?: boolean;
}) {
  const { form, write, submit } = useTemplateEditor(record);
  const canChange = useAllows()('Structure.Change');
  const hoursDisabled = !editable || !canChange;
  return (
    <form onSubmit={submit}>
      <Stack>
        <EditorField
          label="Template code"
          value={form.values.code}
          onChange={form.setter('code')}
          error={form.errors.code}
          disabled={!!record || !editable}
        />
        <EditorField
          label="Shift label"
          value={form.values.label}
          onChange={form.setter('label')}
          error={form.errors.label}
          disabled={!editable}
        />
        <EditorField
          label="Start time"
          type="time"
          value={form.values.startLocal}
          onChange={form.setter('startLocal')}
          error={form.errors.startLocal}
          disabled={hoursDisabled}
        />
        <EditorField
          label="End time"
          type="time"
          value={form.values.endLocal}
          onChange={form.setter('endLocal')}
          error={form.errors.endLocal}
          disabled={hoursDisabled}
        />
        <Checkbox
          label="Ends the next day"
          checked={form.values.endsNextDay}
          disabled={hoursDisabled}
          onChange={(event) => form.setField('endsNextDay', event.target.checked)}
        />
        <EditorField
          label="Display order"
          type="number"
          value={form.values.sortOrder}
          onChange={(value) => form.setField('sortOrder', Number(value))}
          error={form.errors.sortOrder}
          disabled={!editable}
        />
        {record ? (
          <Checkbox
            label="Active template"
            checked={form.values.active}
            disabled={!editable || (!record.active && !canChange)}
            onChange={(event) => form.setField('active', event.target.checked)}
          />
        ) : null}
        <p className="text-caption text-text-muted">
          Template edits update every following shift. Exceptions keep their own hours. Unassign all
          shifts before deactivating a template.
        </p>
        <Button type="submit" disabled={!editable || write.isPending}>
          {record ? 'Save template' : 'Create template'}
        </Button>
        <WriteFeedback error={write.error} saved={write.isSuccess} formError={form.errors._form} />
      </Stack>
    </form>
  );
}

function useTemplateEditor(record?: ManagedShiftTemplate) {
  const form = useZodForm(
    record ? UpdateManagedTemplateRequest : CreateManagedTemplateRequest,
    templateValues(record),
  );
  const write = useStructureWrite();
  const retry = useRetryKey();
  function submit(event: FormEvent) {
    event.preventDefault();
    const { code, active, ...fields } = form.values;
    const values = record ? { ...fields, active } : { ...fields, code };
    const body = form.validate({ ...values, idempotencyKey: retry.forInput(values) });
    if (body)
      write.mutate(
        { kind: 'template', id: record?.id, body },
        {
          onSuccess: () => {
            retry.clear();
            if (!record) form.reset();
          },
        },
      );
  }
  return { form, write, submit };
}
