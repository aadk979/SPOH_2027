import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CloneEventWizardRequest, type EventAdministrationResponse } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { eventHref } from '@/shared/lib/eventPath';
import { Button, Callout, Stack } from '@/shared/ui';
import { useCloneEvent } from '../queries';
import { CloneEventFields, COPY_PARTS } from './CloneEventFields';
import { EventWizardReview } from './EventWizardReview';

type Source = EventAdministrationResponse['events'][number];
const ERROR_FIELDS = {
  'clone.name': 'name',
  'clone.slug': 'slug',
  'clone.dayOffsetDays': 'dayOffsetDays',
  'clone.copy': 'copy',
} as const;
function initialValues(source: Source) {
  return {
    name: `${source.name} next year`,
    slug: '',
    dayOffsetDays: 365,
    inviteSamePeople: false,
    copy: {
      categories: true,
      stations: true,
      daysAndShifts: true,
      gifts: true,
      settings: true,
      content: true,
      permissions: true,
    },
    joinAsAdmin: true,
  };
}
export function CloneEventWizard({ source }: { source: Source }) {
  const form = useZodForm(CloneEventWizardRequest, initialValues(source), ERROR_FIELDS);
  const receipt = useRetryKey();
  const clone = useCloneEvent();
  const router = useRouter();
  const [review, setReview] = useState<CloneEventWizardRequest | null>(null);
  function submit(event: FormEvent): void {
    event.preventDefault();
    const { joinAsAdmin, ...details } = form.values;
    const body = form.validate({
      organisationId: source.organisationId,
      sourceEventId: source.id,
      clone: details,
      joinAsAdmin,
      idempotencyKey: receipt.forInput(form.values),
    });
    if (body) setReview(body);
  }
  function confirm(): void {
    if (!review) return;
    clone.mutate(review, {
      onSuccess: (result) => {
        receipt.clear();
        if (result.joined) router.push(eventHref(result.event.slug, '/setup'));
        else setReview(null);
      },
    });
  }
  return (
    <Stack>
      <h2 className="text-title">Clone {source.name}</h2>
      <p>
        The source is {source.status.toLowerCase()}. Copies start fresh, with no captures,
        attendance, incidents or completed briefing records.
      </p>
      {review ? (
        <EventWizardReview
          name={review.clone.name}
          joined={review.joinAsAdmin}
          pending={clone.isPending}
          confirm={confirm}
          edit={() => setReview(null)}
        >
          <p>
            Days move by {review.clone.dayOffsetDays}. Copy:{' '}
            {COPY_PARTS.filter((part) => review.clone.copy?.[part.key])
              .map((part) => part.label)
              .join(', ') || 'none'}
            .
          </p>
          <p>
            {review.clone.inviteSamePeople
              ? 'The same active people will be invited again.'
              : 'No people will be invited.'}
          </p>
        </EventWizardReview>
      ) : (
        <form onSubmit={submit}>
          <Stack>
            <CloneEventFields values={form.values} errors={form.errors} change={form.setField} />
            <Button type="submit">Review clone</Button>
          </Stack>
        </form>
      )}
      {clone.isError ? (
        <Callout tone="alert" role="alert">
          {clone.error.message}
        </Callout>
      ) : null}
      {clone.isSuccess && !clone.data.joined ? (
        <Callout tone="ok" role="status">
          Created {clone.data.event.name}. You have not joined its roster.
        </Callout>
      ) : null}
    </Stack>
  );
}
