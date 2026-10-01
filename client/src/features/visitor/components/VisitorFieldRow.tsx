import type { ReactNode } from 'react';
import { UpdateVisitorFieldRequest, type VisitorFieldRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Checkbox, Field, Input } from '@/shared/ui';
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
  return (
    <form
      className="flex flex-col gap-sm border-t border-line pt-md"
      onSubmit={(event) => {
        event.preventDefault();
        const body = form.validate();
        if (body) save.mutate({ id: field.id, body });
      }}
    >
      <p className="font-semibold">
        {field.code} · {field.type} · {field.classification}
      </p>
      <Field id={`${prefix}-label`} label="Label" error={form.errors.label}>
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
        checked={form.values.active}
        disabled={!canEdit || save.isPending}
        onChange={(event) => form.setField('active', event.target.checked)}
      />
      {save.isError ? <p role="alert">Could not save this field. Try again.</p> : null}
      {save.isSuccess ? <p role="status">Field saved.</p> : null}
      {canEdit ? (
        <Button type="submit" variant="secondary" disabled={save.isPending}>
          Save field
        </Button>
      ) : null}
    </form>
  );
}
