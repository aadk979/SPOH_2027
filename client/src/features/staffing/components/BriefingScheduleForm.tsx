import type { EventDayRecord, VolunteerAdminRecord } from '@spoh/shared';
import { Button, Field, Input, Select, Stack, Textarea } from '@/shared/ui';
import { useBriefingScheduleForm } from '../hooks/useBriefingScheduleForm';
import { MutationFeedback } from './MutationFeedback';

export function BriefingScheduleForm({
  day,
  people,
  timezone,
}: {
  day: EventDayRecord;
  people: VolunteerAdminRecord[];
  timezone: string;
}) {
  const { form, mutation, submit } = useBriefingScheduleForm(day, timezone);
  return (
    <Stack>
      <Field id="briefing-time" label={`Briefing time (${timezone})`} error={form.errors.time}>
        {(props) => (
          <Input
            {...props}
            type="time"
            value={form.values.time}
            onChange={(event) => form.setField('time', event.target.value)}
          />
        )}
      </Field>
      <Field id="briefing-person" label="Briefer" error={form.errors.briefierId}>
        {(props) => (
          <Select
            {...props}
            value={form.values.briefierId}
            onChange={(event) => form.setField('briefierId', event.target.value)}
          >
            <option value="">Unassigned</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="briefing-wave" label="Wave size" error={form.errors.waveSize}>
        {(props) => (
          <Input
            {...props}
            type="number"
            min={1}
            max={1000}
            value={form.values.waveSize}
            onChange={(event) => form.setField('waveSize', event.target.value)}
          />
        )}
      </Field>
      <Field id="briefing-notes" label="Briefing notes" optional error={form.errors.notes}>
        {(props) => (
          <Textarea
            {...props}
            value={form.values.notes}
            onChange={(event) => form.setField('notes', event.target.value)}
          />
        )}
      </Field>
      <Button disabled={mutation.isPending} onClick={submit}>
        Schedule briefing
      </Button>
      <MutationFeedback error={mutation.error} saved={mutation.isSuccess} />
    </Stack>
  );
}
