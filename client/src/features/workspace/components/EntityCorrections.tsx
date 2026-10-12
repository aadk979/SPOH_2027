'use client';
import { useState } from 'react';
import { VoidGiftRedemptionRequest, type EntityResponse } from '@spoh/shared';
import { useAllows } from '@/features/session';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Card, ConfirmationDialog, Field, Input, MutationFeedback, Stack } from '@/shared/ui';
import { useRetainedCorrection } from '../queries';
import type { RetainedCorrection } from '../api';

export function EntityCorrections({ entity }: { entity: EntityResponse }) {
  const allows = useAllows();
  const kind = entity.ref.kind;
  if (kind !== 'redemption' && kind !== 'import') return null;
  const actionPath = kind === 'redemption' ? '/admin/corrections' : '/chief/imports';
  const offered = entity.actions.some((link) => link.destination.type === 'action' &&
    link.destination.path === actionPath && link.destination.query?.id === entity.ref.id);
  if (!offered || !allows(kind === 'redemption' ? 'Record.Void' : 'Fallback.Import')) return null;
  return <RetainedCorrectionForm key={`${kind}:${entity.ref.id}`} kind={kind} id={entity.ref.id} title={entity.title} />;
}

function RetainedCorrectionForm({ kind, id, title }: { kind: 'redemption' | 'import'; id: string; title: string }) {
  const form = useZodForm(VoidGiftRedemptionRequest, { reason: '' });
  const receipt = useRetryKey();
  const mutation = useRetainedCorrection();
  const [review, setReview] = useState<RetainedCorrection | null>(null);
  const label = kind === 'redemption' ? 'Void this redemption' : 'Undo this capture import';
  function prepare() {
    const values = { reason: form.values.reason };
    const body = form.validate({ ...values, idempotencyKey: receipt.forInput({ kind, id, ...values }) });
    if (body) setReview({ kind, id, body });
  }
  function confirm() {
    if (!review) return;
    mutation.mutate(review, { onSuccess: () => { setReview(null); receipt.clear(); form.reset(); } });
  }
  return <Card><Stack><h2 className="font-semibold">{label}</h2>
    <p>{kind === 'redemption' ? 'Restore stock in the recorded pool. The redemption stays in the audit history.' :
      'Void only the capture rows this import owns. Previously voided rows remain retained; roster and legacy unknown imports cannot be undone.'}</p>
    <div data-form><Field id="retained-correction-reason" label="Reason for correction" error={form.errors.reason}>
      {(props) => <Input {...props} value={form.values.reason} maxLength={500} disabled={mutation.isPending}
        onChange={(event) => { form.setField('reason', event.target.value); mutation.reset(); }} />}
    </Field><Button variant="danger" className="mt-sm" onClick={prepare} disabled={mutation.isPending}>Review correction</Button></div>
    <MutationFeedback error={mutation.error} saved={mutation.isSuccess} operation="Correcting this record" success="Correction recorded; the original rows remain in history." />
    <ConfirmationDialog open={review !== null} title={label} confirmLabel={label} pending={mutation.isPending}
      onCancel={() => setReview(null)} onConfirm={confirm}>
      <p>{title}</p><p className="mt-sm whitespace-pre-wrap">Reason: {review?.body.reason}</p>
      <MutationFeedback error={mutation.error} operation="Correcting this record" onRetry={confirm} />
    </ConfirmationDialog>
  </Stack></Card>;
}
