import { useState, type ReactNode } from 'react';
import { ErasePersonRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useReviewFocus } from '@/shared/hooks/useReviewFocus';
import { Button, Callout, Field, Input, Stack, ErrorState } from '@/shared/ui';
import { useErasePersonData } from '../queries';
export function PersonDataErasure({ id }: { id: string }): ReactNode {
  const form = useZodForm(ErasePersonRequest, { reason: '' });
  const erase = useErasePersonData();
  const [review, setReview] = useState(false);
  const origin = useReviewFocus(review);
  function prepare(): void { if (form.validate()) setReview(true); }
  function apply(): void {
    const body = form.validate();
    if (body) erase.mutate({ id, body }, { onSuccess: () => setReview(false) });
  }
  return <Stack><p>Erase this suspended person’s name, email, phone and profile fields from the application. Counts and audit references remain. This cannot be undone.</p>
    <p>The sign-in provider and retained backups follow their own retention process.</p>
    <Field id="erase-person-reason" label="Erasure reason" error={form.errors.reason} hint="Record the verified request or retention basis.">
      {(props) => <Input {...props} value={form.values.reason} onChange={(event) => { form.setField('reason', event.target.value); setReview(false); }} />}
    </Field>
    {review ? <Callout tone="warn"><p>Permanently erase this suspended person’s application profile?</p>
      <Button variant="danger" disabled={erase.isPending} onClick={apply}>Confirm profile erasure</Button>
      <Button variant="quiet" onClick={() => setReview(false)}>Cancel</Button></Callout> :
      <Button ref={origin} variant="secondary" disabled={erase.isPending} onClick={prepare}>Review profile erasure</Button>}
    {erase.error ? <ErrorState error={erase.error} /> : null}
    {erase.isSuccess ? <p role="status">Application profile erased. Counts and audit references are retained.</p> : null}
  </Stack>;
}
