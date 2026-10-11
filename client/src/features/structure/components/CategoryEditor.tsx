import type { FormEvent } from 'react';
import {
  CreateCaptureCategoryRequest,
  UpdateCaptureCategoryRequest,
  type CategoryActivityRecord,
} from '@spoh/shared';
import { categoryValues } from '../model/editorDefaults';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Checkbox, Stack } from '@/shared/ui';
import { useStructureWrite } from '../queries';
import { EditorField } from './EditorField';
import { WriteFeedback } from './WriteFeedback';
export function CategoryEditor({
  record,
  editable = true,
}: {
  record?: CategoryActivityRecord;
  editable?: boolean;
}) {
  const form = useZodForm(
    record ? UpdateCaptureCategoryRequest : CreateCaptureCategoryRequest,
    categoryValues(record),
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
        { kind: 'category', id: record?.id, body },
        {
          onSuccess: () => {
            retry.clear();
            if (!record) form.reset();
          },
        },
      );
  }
  return (
    <form onSubmit={submit}>
      <Stack>
        <EditorField
          label="Category code"
          value={form.values.code}
          onChange={form.setter('code')}
          error={form.errors.code}
          disabled={!!record || !editable}
          hint="A-Z, 0-9 and underscores. Historical counts keep this code."
        />
        <EditorField
          label="Category label"
          value={form.values.label}
          onChange={form.setter('label')}
          error={form.errors.label}
          disabled={!editable}
        />
        <EditorField
          label="Display order"
          type="number"
          value={form.values.sortOrder}
          onChange={(value) => form.setField('sortOrder', Number(value))}
          error={form.errors.sortOrder}
          disabled={!editable}
          hint="Lower numbers appear first at registration."
        />
        {record ? (
          <Checkbox
            label="Active category"
            checked={form.values.active}
            disabled={!editable}
            onChange={(event) => form.setField('active', event.target.checked)}
          />
        ) : null}
        <Button type="submit" disabled={!editable || write.isPending}>
          {record ? 'Save category' : 'Create category'}
        </Button>
        <WriteFeedback error={write.error} saved={write.isSuccess} formError={form.errors._form} />
      </Stack>
    </form>
  );
}
