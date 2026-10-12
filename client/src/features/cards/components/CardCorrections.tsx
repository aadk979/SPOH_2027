'use client';
import { useState } from 'react';
import { VoidCardRequest, ReissueCardRequest, type MissionCardRecord } from '@spoh/shared';
import { useAllows } from '@/features/session';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, ConfirmationDialog, MutationFeedback } from '@/shared/ui';
import { useCardCorrections } from '../queries';

type Review = { kind: 'void'; code: string; body: VoidCardRequest }
  | { kind: 'reissue'; code: string; body: ReissueCardRequest };

export function CardCorrections({ card, onChange }: {
  card: MissionCardRecord;
  onChange(card: MissionCardRecord): void;
}) {
  const allows = useAllows();
  const form = useZodForm(ReissueCardRequest, { reason: '', replacementShortCode: '' });
  const voidForm = useZodForm(VoidCardRequest, { reason: '' });
  const { voidMutation, reissue } = useCardCorrections(card, onChange);
  const [review, setReview] = useState<Review | null>(null);
  const pending = voidMutation.isPending || reissue.isPending;
  function confirm(): void {
    if (!review || review.code !== card.shortCode || !allows(review.kind === 'void' ? 'Card.Void' : 'Card.Reissue')) return setReview(null);
    if (review.kind === 'void') voidMutation.mutate(review.body, { onSuccess: () => setReview(null) });
    else reissue.mutate(review.body, { onSuccess: () => setReview(null) });
  }
  return <div className="flex flex-col gap-sm" data-form>
    <ReasonField value={form.values.reason} error={form.errors.reason ?? voidForm.errors.reason} onChange={(value) => {
      form.setField('reason', value); voidForm.setField('reason', value);
    }} />
    {allows('Card.Void') ? <Button variant="danger" disabled={pending || card.status === 'VOIDED'} onClick={() => {
      const body = voidForm.validate(); if (body) setReview({ kind: 'void', code: card.shortCode, body });
    }}>Void this card</Button> : null}
    {allows('Card.Reissue') ? <>
      <Field id="replacement-card" label="Replacement card code" hint="Choose a fresh, unused physical card." error={form.errors.replacementShortCode}>
        {(props) => <Input {...props} value={form.values.replacementShortCode} onChange={(event) => form.setField('replacementShortCode', event.target.value)} />}
      </Field>
      <Button variant="secondary" disabled={pending} onClick={() => {
        const body = form.validate(); if (body) setReview({ kind: 'reissue', code: card.shortCode, body });
      }}>Reissue onto replacement</Button>
    </> : null}
    <CorrectionReview review={review} pending={pending} error={voidMutation.error ?? reissue.error} confirm={confirm} cancel={() => setReview(null)} />
    <MutationFeedback error={voidMutation.error ?? reissue.error} pending={pending} saved={voidMutation.isSuccess || reissue.isSuccess} operation="Correcting this card" success="Card correction confirmed. History is retained." />
  </div>;
}

function CorrectionReview({ review, pending, error, confirm, cancel }: { review: Review | null; pending: boolean; error: unknown; confirm(): void; cancel(): void }) {
  if (!review) return null;
  const title = review.kind === 'void' ? `Void card ${review.code}` : `Replace card ${review.code}`;
  const consequence = review.kind === 'void' ? 'This card becomes unusable. Its history is retained.'
    : `Move this journey onto ${review.body.replacementShortCode}. Use the reviewed replacement card.`;
  return <ConfirmationDialog open title={title} confirmLabel="Confirm correction" pending={pending} onConfirm={confirm} onCancel={cancel}>
    <p>{consequence}</p><p className="mt-sm">Reason: {review.body.reason}</p>
    <MutationFeedback error={error} operation="Correcting this card" />
  </ConfirmationDialog>;
}

function ReasonField({ value, error, onChange }: { value: string; error?: string; onChange(value: string): void }) {
  return <Field id="card-correction-reason" label="Correction reason" hint="This reason is recorded in the audit. Review the code before confirming." error={error}>
    {(props) => <Input {...props} value={value} onChange={(event) => onChange(event.target.value)} />}
  </Field>;
}
