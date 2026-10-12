import { useId, type FormEvent } from 'react';
import {
  CreateStationTypeRequest,
  UpdateStationTypeRequest,
  type ManagedStationType,
} from '@spoh/shared';
import { typeValues } from '../model/editorDefaults';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Checkbox, ControlHelp, Stack } from '@/shared/ui';
import { useStructureWrite } from '../queries';
import { useAllows } from '@/features/session';
import { EditorField } from './EditorField';
import { WriteFeedback } from './WriteFeedback';

const CAPABILITIES = [
  ['registersVisitors', 'Registers visitors'],
  ['countsEntry', 'Counts room entries'],
  ['issuesStamp', 'Stamps mission cards'],
  ['redeemsGifts', 'Redeems gifts'],
] as const;
export function StationTypeEditor({
  record,
  editable = true,
}: {
  record?: ManagedStationType;
  editable?: boolean;
}) {
  const prefix = useId();
  const canChange = useAllows()('Structure.Change');
  const { form, write, submit } = useTypeEditor(record);
  return (
    <form onSubmit={submit}>
      <Stack>
        <EditorField
          label="Type code"
          value={form.values.code}
          onChange={form.setter('code')}
          error={form.errors.code}
          disabled={!!record || !editable}
          hint="Stable code for imports. It cannot be renamed."
        />
        <EditorField
          label="Type label"
          hint="The name shown when choosing a station type."
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
          hint="Lower numbers appear first."
        />
        <fieldset disabled={!editable || !canChange} aria-describedby={`${prefix}-capabilities`}>
          <legend className="font-semibold">What happens at this station type</legend>
          <ControlHelp id={`${prefix}-capabilities`}>These capabilities control the capture tools at every station of this type. Change them only after reviewing affected stations.</ControlHelp>
          {CAPABILITIES.map(([key, label]) => (
            <Checkbox
              key={key}
              name={`${prefix}-${key}`}
              label={label}
              checked={form.values[key]}
              onChange={(event) => form.setField(key, event.target.checked)}
            />
          ))}
        </fieldset>
        {record ? (
          <Checkbox
            label="Active type"
            aria-describedby={`${prefix}-active`}
            checked={form.values.active}
            disabled={!editable || (!record.active && !canChange)}
            onChange={(event) => form.setField('active', event.target.checked)}
          />
        ) : null}
        {record ? <ControlHelp id={`${prefix}-active`}>Turning this off prevents new stations choosing this type. Existing stations retain their type and records.</ControlHelp> : null}
        <Button type="submit" disabled={!editable || write.isPending}>
          {record ? 'Save type' : 'Create type'}
        </Button>
        <WriteFeedback error={write.error} saved={write.isSuccess} formError={form.errors._form} />
      </Stack>
    </form>
  );
}

function useTypeEditor(record?: ManagedStationType) {
  const form = useZodForm(
    record ? UpdateStationTypeRequest : CreateStationTypeRequest,
    typeValues(record),
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
        { kind: 'type', id: record?.id, body },
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
