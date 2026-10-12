'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BrandingDraft, type BrandingState } from '@spoh/shared';
import { Button, Callout, MutationFeedback, Stack } from '@/shared/ui';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useBrandingWrites } from '../queries';
import { BrandingFields } from './BrandingFields';
import { DraftPreview } from './DraftPreview';
import { BrandingPublication } from './BrandingPublication';

export function BrandingEditor({ state, canEdit, canPublish }: { state: BrandingState; canEdit: boolean; canPublish: boolean }) {
  const form = useZodForm(BrandingDraft, state.draft);
  const writes = useBrandingWrites(state.version);
  const [confirming, setConfirming] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const busy = writes.save.isPending || writes.publish.isPending || writes.upload.isPending;
  const canChange = canChangeDraft(canEdit, busy, confirming);
  const changed = JSON.stringify(form.values) !== JSON.stringify(state.draft);
  const change = (next: BrandingDraft) => { form.reset(next); writes.save.reset(); writes.publish.reset(); };
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = form.validate();
    if (parsed && canChange) writes.save.mutate(parsed);
  }
  async function upload(file: File) {
    if (!canChange) return;
    const id = await writes.upload.mutateAsync(file).catch(() => null);
    if (id && alive.current) form.setField('uploadReceiptId', id);
  }
  return <Stack>
    <Callout>Publishing makes this event's name, logo and colour visible before sign-in. A later authorized event rename updates the public name immediately. Exported reports and cards retain their frozen identity.</Callout>
    <form onSubmit={submit} className="flex flex-col gap-md">
      <BrandingFields value={form.values} errors={form.errors} disabled={!canChange} onChange={change} onUpload={(file) => void upload(file)} />
      <MutationFeedback error={writes.upload.error} pending={writes.upload.isPending} operation="Upload logo" />
      {canEdit ? <Button type="submit" disabled={!canChange || !changed}>Save branding draft</Button> : null}
      <MutationFeedback error={writes.save.error} pending={writes.save.isPending} saved={writes.save.isSuccess} operation="Save branding draft" success="Draft saved. Review the actual variants before publication." />
    </form>
    {state.draft.uploadReceiptId ? <DraftPreview eventId={state.eventId} /> : <p>No draft logo. Publication uses the event name and accent.</p>}
    {changed ? <p>Save and review this draft before publishing.</p> : null}
    <BrandingPublication publish={writes.publish} canPublish={canPublish} blocked={busy || changed || state.version === 0} remaining={state.registryRemaining} onConfirmationChange={setConfirming} />
  </Stack>;
}

function canChangeDraft(canEdit: boolean, busy: boolean, confirming: boolean): boolean {
  return canEdit && !busy && !confirming;
}
