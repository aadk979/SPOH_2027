import type { ReactNode } from 'react';
import {
  CreateVisitorFieldRequest,
  type CreateVisitorFieldRequest as VisitorFieldDraft,
} from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, Select } from '@/shared/ui';
import { useCreateVisitorField } from '../queries';
import { ReaderRoles } from './ReaderRoles';

const EMPTY: VisitorFieldDraft = {
  code: '',
  label: '',
  type: 'text',
  classification: 'visitor-personal',
  retentionDays: 30,
  readers: ['CHIEF_COORDINATOR'],
  sortOrder: 0,
};

function useFieldForm() {
  return useZodForm(CreateVisitorFieldRequest, EMPTY);
}

function NewFieldInputs({
  form,
  disabled,
}: {
  form: ReturnType<typeof useFieldForm>;
  disabled: boolean;
}): ReactNode {
  return (
    <>
      <Field id="new-visitor-code" label="Code" error={form.errors.code}>
        {(props) => (
          <Input
            {...props}
            value={form.values.code}
            disabled={disabled}
            onChange={(event) => form.setField('code', event.target.value)}
          />
        )}
      </Field>
      <Field id="new-visitor-label" label="Label" error={form.errors.label}>
        {(props) => (
          <Input
            {...props}
            value={form.values.label}
            disabled={disabled}
            onChange={(event) => form.setField('label', event.target.value)}
          />
        )}
      </Field>
      <Field id="new-visitor-type" label="Input type" error={form.errors.type}>
        {(props) => (
          <Select
            {...props}
            value={form.values.type}
            disabled={disabled}
            onChange={(event) =>
              form.setField('type', event.target.value as VisitorFieldDraft['type'])
            }
          >
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="number">Number</option>
          </Select>
        )}
      </Field>
    </>
  );
}

function NewFieldPolicyInputs({
  form,
  disabled,
}: {
  form: ReturnType<typeof useFieldForm>;
  disabled: boolean;
}): ReactNode {
  return (
    <>
      <Field id="new-visitor-class" label="Data class" error={form.errors.classification}>
        {(props) => (
          <Select
            {...props}
            value={form.values.classification}
            disabled={disabled}
            onChange={(event) =>
              form.setField(
                'classification',
                event.target.value as VisitorFieldDraft['classification'],
              )
            }
          >
            <option value="visitor-personal">Visitor personal</option>
            <option value="operational">Operational, identifies nobody</option>
          </Select>
        )}
      </Field>
      <Field
        id="new-visitor-retention"
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
            disabled={disabled}
            onChange={(event) => form.setField('retentionDays', Number(event.target.value))}
          />
        )}
      </Field>
      <ReaderRoles
        value={form.values.readers}
        onChange={(readers) => form.setField('readers', readers)}
        disabled={disabled}
      />
      {form.errors.readers ? <p role="alert">{form.errors.readers}</p> : null}
    </>
  );
}

export function CreateVisitorFieldForm(): ReactNode {
  const form = useFieldForm();
  const create = useCreateVisitorField();
  return (
    <form
      className="flex flex-col gap-sm border-t border-line pt-md"
      onSubmit={(event) => {
        event.preventDefault();
        const body = form.validate();
        if (body) create.mutate(body, { onSuccess: () => form.reset() });
      }}
    >
      <h4 className="font-semibold">Add a field</h4>
      <NewFieldInputs form={form} disabled={create.isPending} />
      <NewFieldPolicyInputs form={form} disabled={create.isPending} />
      {create.isError ? (
        <p role="alert">Could not add this field. Check its code and try again.</p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={create.isPending}>
        Add field
      </Button>
    </form>
  );
}
