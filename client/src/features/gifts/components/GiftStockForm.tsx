'use client';
import { AdjustGiftStockRequest, type GiftTypeRecord } from '@spoh/shared';
import { useState } from 'react';
import { useEvent } from '@/shared/lib/eventContext';
import { useAllows } from '@/features/session';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, ConfirmationDialog, ControlHelp, Field, Input, MutationFeedback, useToast } from '@/shared/ui';
import { useGiftAdmin } from '../queries';
type StockReview = { id: string; name: string; body: AdjustGiftStockRequest & { expectedRehearsal: boolean } };
export function GiftStockForm({ gift }: { gift: GiftTypeRecord }) {
  const form = useZodForm(AdjustGiftStockRequest, { delta: 0, reason: '' });
  const { adjust } = useGiftAdmin();
  const event = useEvent();
  const allows = useAllows();
  const announce = useToast();
  const [review, setReview] = useState<StockReview | null>(null);
  function prepare() {
    const body = form.validate();
    if (body) { adjust.reset(); setReview({ id: gift.id, name: gift.name, body: { ...body, expectedRehearsal: gift.rehearsal ?? event.status === 'REHEARSAL' } }); }
  }
  function confirm() {
    if (!review || review.id !== gift.id || !allows('Count.Adjust')) return;
    adjust.mutate({ id: review.id, body: review.body }, { onSuccess: () => {
      setReview(null); form.reset(); announce('Stock change confirmed in the reviewed pool.');
    } });
  }
  return <form className="flex flex-col gap-sm" onSubmit={(event) => {
    event.preventDefault(); prepare();
  }}>
    <Field id={`stock-delta-${gift.id}`} label="Stock change" hint="Positive for deliveries; negative for damage or a recount." error={form.errors.delta}>
      {(props) => <Input {...props} type="number" disabled={adjust.isPending} value={form.values.delta} onChange={(e) => form.setField('delta', Number(e.target.value))} />}
    </Field>
    <Field id={`stock-reason-${gift.id}`} label="Reason for stock change" hint="Describe the delivery or correction so the audit can explain the total." error={form.errors.reason}>
      {(props) => <Input {...props} disabled={adjust.isPending} value={form.values.reason} onChange={(e) => form.setField('reason', e.target.value)} />}
    </Field>
    <ControlHelp topic="stock">This changes the reviewed live or practice pool. Opening stock and past handovers stay in history.</ControlHelp>
    <MutationFeedback error={adjust.error} pending={adjust.isPending} saved={adjust.isSuccess} operation="Changing gift stock" success="Stock change recorded in the reviewed pool." />
    <Button type="submit" variant="secondary" disabled={adjust.isPending}>Review stock change</Button>
    <ConfirmationDialog open={review !== null} title="Review gift stock change" confirmLabel="Record stock change" pending={adjust.isPending} onCancel={() => setReview(null)} onConfirm={confirm}>
      <p>Gift: {review?.name}</p><p>Pool: {review?.body.expectedRehearsal ? 'Practice' : 'Live'}</p>
      <p>Stock change: {review?.body.delta}</p><p className="whitespace-pre-wrap">Reason: {review?.body.reason}</p>
      <p>If the event changes mode, this review is refused. Review the current pool again.</p>
      <MutationFeedback error={adjust.error} operation="Changing gift stock" onRetry={confirm} />
    </ConfirmationDialog>
  </form>;
}
