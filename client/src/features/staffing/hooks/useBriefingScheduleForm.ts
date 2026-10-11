import { CreateBriefingSlotRequest, wallTimeToInstant, type EventDayRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { scheduleBriefing } from '../api';
import { useStaffingWrite } from '../queries';

export function useBriefingScheduleForm(day: EventDayRecord, timezone: string) {
  const form = useZodForm(
    CreateBriefingSlotRequest,
    { time: '', briefierId: '', waveSize: '20', notes: '' },
    { startsAt: 'time' },
  );
  const receipt = useRetryKey();
  const mutation = useStaffingWrite(scheduleBriefing);
  function submit() {
    const fields = form.values;
    const input = {
      eventDayId: day.id,
      startsAt: fields.time ? wallTimeToInstant(day.date, fields.time, timezone).toISOString() : '',
      briefierId: fields.briefierId || null,
      waveSize: Number(fields.waveSize),
      notes: fields.notes,
    };
    const body = form.validate({ ...input, idempotencyKey: receipt.forInput(input) });
    if (body)
      mutation.mutate(body, {
        onSuccess: () => {
          receipt.clear();
          form.reset();
        },
      });
  }
  return { form, mutation, submit };
}
