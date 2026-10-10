import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CreateEventRequest, type EventAdministrationResponse } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { eventHref } from '@/shared/lib/eventPath';
import { Button, Callout, Checkbox, Stack } from '@/shared/ui';
import { useCreateEvent } from '../queries';
import { EventBasicsFields } from './EventBasicsFields';
import { EventWizardReview } from './EventWizardReview';

type Organisation = EventAdministrationResponse['organisations'][number];
export function CreateEventWizard({ organisation }: { organisation: Organisation }) {
  const form = useZodForm(CreateEventRequest, {
    organisationId: organisation.id,
    name: '',
    slug: '',
    venue: '',
    timezone: organisation.timezone,
    startDate: '',
    endDate: '',
    joinAsAdmin: true,
  });
  const receipt = useRetryKey();
  const create = useCreateEvent();
  const router = useRouter();
  const [review, setReview] = useState<CreateEventRequest | null>(null);
  function submit(event: FormEvent): void {
    event.preventDefault();
    const body = form.validate({ ...form.values, idempotencyKey: receipt.forInput(form.values) });
    if (body) setReview(body);
  }
  function confirm(): void {
    if (!review) return;
    create.mutate(review, {
      onSuccess: (result) => {
        receipt.clear();
        if (result.joined) router.push(eventHref(result.event.slug, '/setup'));
        else setReview(null);
      },
    });
  }
  return (
    <Stack>
      <h2 className="text-title">Create an event in {organisation.name}</h2>
      {review ? (
        <EventWizardReview
          name={review.name}
          joined={review.joinAsAdmin}
          pending={create.isPending}
          confirm={confirm}
          edit={() => setReview(null)}
        >
          <p>
            {review.startDate} to {review.endDate} · {review.timezone} ·{' '}
            {review.venue || 'No venue entered'}
          </p>
        </EventWizardReview>
      ) : (
        <form onSubmit={submit}>
          <Stack>
            <EventBasicsFields values={form.values} errors={form.errors} change={form.setField} />
            <Checkbox
              checked={form.values.joinAsAdmin}
              label="Join new event as Admin"
              onChange={(event) => form.setField('joinAsAdmin', event.target.checked)}
            />
            <Button type="submit">Review event</Button>
          </Stack>
        </form>
      )}
      {create.isError ? (
        <Callout tone="alert" role="alert">
          {create.error.message}
        </Callout>
      ) : null}
      {create.isSuccess && !create.data.joined ? (
        <Callout tone="ok" role="status">
          Created {create.data.event.name}. You have not joined its roster.
        </Callout>
      ) : null}
    </Stack>
  );
}
