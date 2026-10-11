import type { FormEvent } from 'react';
import {
  CreateStationTagRequest,
  UpdateStationTagRequest,
  type ManagedStationTag,
} from '@spoh/shared';
import { tagValues } from '../model/editorDefaults';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Checkbox, Stack } from '@/shared/ui';
import { useStructureWrite } from '../queries';
import { EditorField } from './EditorField';
import { WriteFeedback } from './WriteFeedback';
export function StationTagEditor({
  record,
  editable = true,
}: {
  record?: ManagedStationTag;
  editable?: boolean;
}) {
  const form = useZodForm(
    record ? UpdateStationTagRequest : CreateStationTagRequest,
    tagValues(record),
  );
  const write = useStructureWrite();
  const retry = useRetryKey();
  function submit(event: FormEvent) {
    event.preventDefault();
    const { code, active, ...fields } = form.values;
    const values = {
      ...fields,
      description: fields.description.trim() || null,
      ...(record ? { active } : { code }),
    };
    const body = form.validate({ ...values, idempotencyKey: retry.forInput(values) });
    if (body)
      write.mutate(
        { kind: 'tag', id: record?.id, body },
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
          label="Tag code"
          value={form.values.code}
          onChange={form.setter('code')}
          error={form.errors.code}
          disabled={!!record || !editable}
          hint="Stable code for imports. It cannot be renamed."
        />
        <EditorField
          label="Tag label"
          value={form.values.label}
          onChange={form.setter('label')}
          error={form.errors.label}
          disabled={!editable}
        />
        <EditorField
          label="Tag description"
          value={form.values.description}
          onChange={form.setter('description')}
          error={form.errors.description}
          disabled={!editable}
        />
        {record ? (
          <Checkbox
            label="Active tag"
            checked={form.values.active}
            disabled={!editable}
            onChange={(event) => form.setField('active', event.target.checked)}
          />
        ) : null}
        <Button type="submit" disabled={!editable || write.isPending}>
          {record ? 'Save tag' : 'Create tag'}
        </Button>
        <WriteFeedback error={write.error} saved={write.isSuccess} formError={form.errors._form} />
      </Stack>
    </form>
  );
}
