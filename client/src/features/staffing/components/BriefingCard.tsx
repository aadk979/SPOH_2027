import { CompleteBriefingSlotRequest, type BriefingSlotRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { useEventTime } from '@/features/session';
import { Button, Card, Field, Textarea } from '@/shared/ui';
import { completeBriefing } from '../api';
import { useStaffingWrite } from '../queries';
import { MutationFeedback } from './MutationFeedback';

export function BriefingCard({
  slot,
  canComplete,
}: {
  slot: BriefingSlotRecord;
  canComplete: boolean;
}) {
  const form = useZodForm(CompleteBriefingSlotRequest, { notes: '' });
  const mutation = useStaffingWrite(completeBriefing);
  const receipt = useRetryKey();
  const format = useEventTime();
  function complete() {
    const body = form.validate({ ...form.values, idempotencyKey: receipt.forInput(form.values) });
    if (body) mutation.mutate({ id: slot.id, ...body }, { onSuccess: receipt.clear });
  }
  return (
    <Card>
      <h3 className="font-semibold">
        {format.dateTime(slot.startsAt)} · {slot.waveSize} people
      </h3>
      <p>
        {slot.briefierName ?? 'Unassigned'}
        {slot.isMine ? ' · Your briefing' : ''}
      </p>
      {slot.notes ? <p>{slot.notes}</p> : null}
      {slot.completedAt ? (
        <p>Completed {format.dateTime(slot.completedAt)}</p>
      ) : canComplete ? (
        <>
          <Field
            id={`complete-notes-${slot.id}`}
            label="Completion notes"
            optional
            error={form.errors.notes}
          >
            {(props) => (
              <Textarea
                {...props}
                value={form.values.notes}
                onChange={(event) => form.setField('notes', event.target.value)}
              />
            )}
          </Field>
          <Button disabled={mutation.isPending} onClick={complete}>
            Mark briefing complete
          </Button>
          <MutationFeedback error={mutation.error} saved={mutation.isSuccess} />
        </>
      ) : (
        <p>Awaiting completion by the briefer or IC.</p>
      )}
    </Card>
  );
}
