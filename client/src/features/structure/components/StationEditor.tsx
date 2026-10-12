import type { FormEvent } from 'react';
import {
  CreateStationRequest,
  UpdateStationRequest,
  type StationSummary,
  type StructureResponse,
} from '@spoh/shared';
import { stationValues } from '../model/editorDefaults';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Checkbox, ControlHelp, Stack } from '@/shared/ui';
import { useStationWrite } from '../queries';
import { EditorField } from './EditorField';
import { StationStructureFields } from './StationStructureFields';
import { WriteFeedback } from './WriteFeedback';

export function StationEditor({
  record,
  structure,
  editable = true,
}: {
  record?: StationSummary;
  structure: StructureResponse['data'];
  editable?: boolean;
}) {
  const { form, write, submit } = useStationEditor(record);
  return (
    <form onSubmit={submit}>
      <Stack>
        <EditorField
          label="Station code"
          value={form.values.code}
          onChange={form.setter('code')}
          error={form.errors.code}
          disabled={!!record || !editable}
          hint="Stable code for roster and fallback imports. It cannot be renamed."
        />
        <EditorField
          label="Station name"
          hint="The name shown in station choices, assignments and the event map."
          value={form.values.name}
          onChange={form.setter('name')}
          error={form.errors.name}
          disabled={!editable}
        />
        <StationStructureFields
          structure={structure}
          typeCode={form.values.typeCode}
          tagCodes={form.values.tagCodes}
          onTypeChange={form.setter('typeCode')}
          onTagsChange={form.setter('tagCodes')}
          errors={form.errors}
          disabled={!editable}
        />
        <EditorField
          label="Floor or location"
          value={form.values.floor}
          onChange={form.setter('floor')}
          error={form.errors.floor}
          disabled={!editable}
          hint="Use the location visitors will see on the map."
        />
        <EditorField
          label="Display order"
          hint="Lower numbers appear first in station lists."
          type="number"
          value={form.values.sortOrder}
          onChange={(value) => form.setField('sortOrder', Number(value))}
          error={form.errors.sortOrder}
          disabled={!editable}
        />
        {record ? (
          <Checkbox
            label="Active station"
            aria-describedby={`station-active-${record.id}`}
            checked={form.values.active}
            disabled={!editable}
            onChange={(event) => form.setField('active', event.target.checked)}
          />
        ) : null}
        {record ? <ControlHelp id={`station-active-${record.id}`}>Turning this off removes the station from new selections. Existing records and assignments remain in history.</ControlHelp> : null}
        <Button type="submit" disabled={!editable || write.isPending}>
          {record ? 'Save station' : 'Create station'}
        </Button>
        <WriteFeedback error={write.error} saved={write.isSuccess} formError={form.errors._form} />
      </Stack>
    </form>
  );
}

function useStationEditor(record?: StationSummary) {
  const form = useZodForm(
    record ? UpdateStationRequest : CreateStationRequest,
    stationValues(record),
  );
  const write = useStationWrite();
  const retry = useRetryKey();
  function submit(event: FormEvent) {
    event.preventDefault();
    const { code, active, ...fields } = form.values;
    const values = {
      ...fields,
      floor: fields.floor.trim() || null,
      ...(record ? { active } : { code }),
    };
    const body = form.validate({ ...values, idempotencyKey: retry.forInput(values) });
    if (body)
      write.mutate(
        { id: record?.id, body },
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
