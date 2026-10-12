import type { FormEvent } from 'react';
import {
  CreateManagedTemplateRequest,
  UpdateManagedTemplateRequest,
  type ManagedShiftTemplate,
} from '@spoh/shared';
import { templateValues } from '../model/editorDefaults';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Checkbox, ControlHelp, Stack } from '@/shared/ui';
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
  const helpKey = record?.id ?? 'new';
  return (
    <form onSubmit={submit}>
      <Stack>
        <EditorField
          label="Template code"
          hint="Stable code used to create each day's shift. It cannot be renamed."
          value={form.values.code}
          onChange={form.setter('code')}
          error={form.errors.code}
          disabled={!!record || !editable}
        />
        <EditorField
          label="Shift label"
          hint="The label shown on assignments and the shift schedule."
          value={form.values.label}
          onChange={form.setter('label')}
          error={form.errors.label}
          disabled={!editable}
        />
        <TemplateHoursFields form={form} disabled={hoursDisabled} helpKey={helpKey} />
        <EditorField
          label="Display order"
          hint="Lower numbers appear first in shift-template choices."
          type="number"
          value={form.values.sortOrder}
          onChange={(value) => form.setField('sortOrder', Number(value))}
          error={form.errors.sortOrder}
          disabled={!editable}
        />
        {record ? <TemplateActiveFields record={record} form={form} editable={editable} canChange={canChange} /> : null}
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

function TemplateActiveFields({ record, form, editable, canChange }: {
  record: ManagedShiftTemplate; form: ReturnType<typeof useTemplateEditor>['form']; editable: boolean; canChange: boolean;
}) {
  return <>
    <Checkbox
      label="Active template"
      aria-describedby={`template-active-${record.id}`}
      checked={form.values.active}
      disabled={!editable || (!record.active && !canChange)}
      onChange={(event) => form.setField('active', event.target.checked)}
    />
    <ControlHelp id={`template-active-${record.id}`}>Active templates create shifts on added event days. Unassign affected shifts before deactivating this template.</ControlHelp>
  </>;
}

function TemplateHoursFields({ form, disabled, helpKey }: { form: ReturnType<typeof useTemplateEditor>['form']; disabled: boolean; helpKey: string }) {
  return <>
    <EditorField label="Start time" hint="Event-local start for every shift following this template. Existing exceptions keep their own hours."
      type="time" value={form.values.startLocal} onChange={form.setter('startLocal')} error={form.errors.startLocal} disabled={disabled} />
    <EditorField label="End time" hint="Event-local end for every shift following this template. Use a single-shift exception for one date."
      type="time" value={form.values.endLocal} onChange={form.setter('endLocal')} error={form.errors.endLocal} disabled={disabled} />
    <Checkbox label="Ends the next day" aria-describedby={`template-next-${helpKey}`} checked={form.values.endsNextDay}
      disabled={disabled} onChange={(event) => form.setField('endsNextDay', event.target.checked)} />
    <ControlHelp id={`template-next-${helpKey}`}>The end time belongs to the following calendar day, so an overnight shift can end after midnight.</ControlHelp>
  </>;
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
