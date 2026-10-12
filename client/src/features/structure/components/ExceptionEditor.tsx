import type { FormEvent } from 'react';
import { UpdateShiftExceptionRequest, type ShiftExceptionRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Checkbox, ControlHelp, Stack } from '@/shared/ui';
import { useStructureWrite } from '../queries';
import { EditorField } from './EditorField';
import { WriteFeedback } from './WriteFeedback';
export function ExceptionEditor({
  shift,
  editable,
}: {
  shift: ShiftExceptionRecord;
  editable: boolean;
}) {
  const form = useZodForm(UpdateShiftExceptionRequest, {
    startLocal: shift.startLocal,
    endLocal: shift.endLocal,
    endsNextDay: shift.endsNextDay,
  });
  const retry = useRetryKey();
  const write = useStructureWrite();
  function save(values: unknown) {
    const body = form.validate({ ...(values as object), idempotencyKey: retry.forInput(values) });
    if (body) write.mutate({ kind: 'shift', id: shift.id, body }, { onSuccess: retry.clear });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    save({ operation: 'override', ...form.values });
  }
  return (
    <form onSubmit={submit}>
      <Stack>
        <EditorField
          label="Exception start time"
          hint="Override the event-local start for this shift only. Other dates keep their template hours."
          type="time"
          value={form.values.startLocal}
          onChange={form.setter('startLocal')}
          error={form.errors.startLocal}
          disabled={!editable}
        />
        <EditorField
          label="Exception end time"
          hint="Override the event-local end for this shift only."
          type="time"
          value={form.values.endLocal}
          onChange={form.setter('endLocal')}
          error={form.errors.endLocal}
          disabled={!editable}
        />
        <Checkbox
          label="Exception ends the next day"
          aria-describedby={`exception-next-${shift.id}`}
          checked={form.values.endsNextDay}
          disabled={!editable}
          onChange={(event) => form.setField('endsNextDay', event.target.checked)}
        />
        <ControlHelp id={`exception-next-${shift.id}`}>Treat the exception end as the following calendar day. Following the template again removes this shift's override.</ControlHelp>
        <Button type="submit" disabled={!editable || write.isPending}>
          Save exception
        </Button>
        {shift.overridden ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!editable || write.isPending}
            onClick={() => save({ operation: 'restore' })}
          >
            Follow template again
          </Button>
        ) : null}
        <WriteFeedback error={write.error} saved={write.isSuccess} formError={form.errors._form} />
      </Stack>
    </form>
  );
}
