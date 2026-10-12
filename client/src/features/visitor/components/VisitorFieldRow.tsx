import type { ReactNode } from 'react';
import { UpdateVisitorFieldRequest, type VisitorFieldRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Checkbox, ControlHelp, Field, Input, MutationFeedback } from '@/shared/ui';
import { useUpdateVisitorField } from '../queries';
import { ReaderRoles } from './ReaderRoles';

export function VisitorFieldRow({
  field,
  canEdit,
}: {
  field: VisitorFieldRecord;
  canEdit: boolean;
}): ReactNode {
  const form = useZodForm(UpdateVisitorFieldRequest, {
    label: field.label,
    retentionDays: field.retentionDays,
    readers: field.readers,
    active: field.active,
  });
  const save = useUpdateVisitorField();
  const prefix = `visitor-${field.id}`;
  function submit() {
    const body = form.validate();
    if (body && canEdit) save.mutate({ id: field.id, body });
  }
  return (
    <form
      className="flex flex-col gap-sm border-t border-line pt-md"
      onSubmit={(event) => { event.preventDefault(); submit(); }}
    >
      <p className="font-semibold">
        {field.code} · {field.type} · {field.classification}
      </p>
      <Field id={`${prefix}-label`} label="Label" hint="The label people see when entering this value. The stable field code is retained." error={form.errors.label}>
        {(props) => (
          <Input
            {...props}
            value={form.values.label}
            disabled={!canEdit || save.isPending}
            onChange={(event) => form.setField('label', event.target.value)}
          />
        )}
      </Field>
      <Field
        id={`${prefix}-retention`}
        label="Keep for days after close"
        hint="Values are removed after this retention period; the separate event counts remain."
        error={form.errors.retentionDays}
      >
        {(props) => (
          <Input
            {...props}
            type="number"
            min={1}
            max={3650}
            value={form.values.retentionDays}
            disabled={!canEdit || save.isPending}
            onChange={(event) => form.setField('retentionDays', Number(event.target.value))}
          />
        )}
      </Field>
      <ReaderRoles
        value={form.values.readers}
        onChange={(readers) => form.setField('readers', readers)}
        disabled={!canEdit || save.isPending}
      />
      {form.errors.readers ? <p role="alert">{form.errors.readers}</p> : null}
      <Checkbox
        label="Available for new captures"
        aria-describedby={`${prefix}-active-help`}
        checked={form.values.active}
        disabled={!canEdit || save.isPending}
        onChange={(event) => form.setField('active', event.target.checked)}
      />
      <ControlHelp id={`${prefix}-active-help`} topic="privacy">Turning this off stops collecting new values. Retained values still follow their reader and retention rules.</ControlHelp>
      <MutationFeedback error={save.error} pending={save.isPending} saved={save.isSuccess} operation="Saving visitor field" success="Field saved." onRetry={submit} />
      {canEdit ? (
        <Button type="submit" variant="secondary" disabled={save.isPending}>
          Save field
        </Button>
      ) : null}
    </form>
  );
}
