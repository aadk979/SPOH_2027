import type { FormEvent } from 'react';
import { CreateEventDayRequest, UpdateEventDayRequest, type EventDayRecord } from '@spoh/shared';
import { dayValues } from '../model/editorDefaults';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Checkbox, ControlHelp, Stack } from '@/shared/ui';
import { useDayWrite } from '../queries';
import { EditorField } from './EditorField';
import { WriteFeedback } from './WriteFeedback';
export function DayEditor({
  record,
  editable = true,
}: {
  record?: EventDayRecord;
  editable?: boolean;
}) {
  const form = useZodForm(
    record ? UpdateEventDayRequest : CreateEventDayRequest,
    dayValues(record),
  );
  const write = useDayWrite();
  const retry = useRetryKey();
  const helpKey = record?.id ?? 'new';
  function submit(event: FormEvent) {
    event.preventDefault();
    const { date, ...fields } = form.values;
    const values = record ? fields : { ...fields, date };
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
  return (
    <form onSubmit={submit}>
      <Stack>
        <EditorField
          label="Event date"
          type="date"
          value={form.values.date}
          onChange={form.setter('date')}
          error={form.errors.date}
          disabled={!!record || !editable}
          hint="Calendar date in the event timezone. Adding a day creates its active template shifts."
        />
        <EditorField
          label="Day label"
          hint="The readable date label shown in day choices and staffing."
          value={form.values.label}
          onChange={form.setter('label')}
          error={form.errors.label}
          disabled={!editable}
        />
        <Checkbox
          label="Public day"
          aria-describedby={`day-public-${helpKey}`}
          checked={form.values.isPublicDay}
          disabled={!editable}
          onChange={(event) => form.setField('isPublicDay', event.target.checked)}
        />
        <ControlHelp id={`day-public-${helpKey}`}>Mark this as a public event day. Shift hours still follow templates and exceptions.</ControlHelp>
        <Checkbox
          label="Tour day"
          aria-describedby={`day-tour-${helpKey}`}
          checked={form.values.isTourDay}
          disabled={!editable}
          onChange={(event) => form.setField('isTourDay', event.target.checked)}
        />
        <ControlHelp id={`day-tour-${helpKey}`}>Allow this day to be selected for tour briefing waves.</ControlHelp>
        <Button type="submit" disabled={!editable || write.isPending}>
          {record ? 'Save day' : 'Create day'}
        </Button>
        <WriteFeedback error={write.error} saved={write.isSuccess} formError={form.errors._form} />
      </Stack>
    </form>
  );
}
