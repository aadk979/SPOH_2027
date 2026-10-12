'use client';
import { useState } from 'react';
import { ConfirmOutboxSalvageRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { salvageCaptureKind } from '@/shared/lib/outboxSalvage';
import type { OutboxEntry } from '@/shared/lib/outbox';
import { Button, Checkbox, ConfirmationDialog, Field, Input, MutationFeedback, Stack } from '@/shared/ui';
import { useConfirmOutboxSalvage } from '../queries';

export function FailedSalvage({ failed }: { failed: OutboxEntry[] }) {
  const [records, setRecords] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ConfirmOutboxSalvageRequest | null>(null);
  const form = useZodForm(ConfirmOutboxSalvageRequest, { reason: '' });
  const receipt = useRetryKey();
  const mutation = useConfirmOutboxSalvage();
  function prepare() {
    const entries = failed.filter((row) => Object.hasOwn(records, row.id)).flatMap((row) => {
      const captureKind = salvageCaptureKind(row);
      return captureKind ? [{ idempotencyKey: row.id, captureKind, recordId: records[row.id] }] : [];
    });
    const intent = { reason: form.values.reason, entries };
    const body = form.validate({ ...intent, idempotencyKey: receipt.forInput(intent) });
    if (body) setReview(body);
  }
  function confirm() {
    if (!review) return;
    mutation.mutate(review, { onSuccess: () => {
      setReview(null); setRecords({}); form.reset(); receipt.clear();
    } });
  }
  return <Stack>
    <h3 className="font-semibold">Confirm recovered captures</h3>
    <p className="text-caption text-text-muted">Select the parked captures that have an actual retained server record, then enter each record ID. The server verifies the original capture key, person and event before recording an audit and clearing only your selection. Copying or entering a paper total alone cannot clear a capture.</p>
    <SalvageSelection failed={failed} records={records} disabled={mutation.isPending}
      update={(id, recordId) => setRecords((current) => {
        const next = { ...current };
        if (recordId === null) delete next[id]; else next[id] = recordId;
        return next;
      })} />
    <div data-form><Field id="salvage-reason" label="Recovery confirmation note" error={form.errors.reason}>
      {(props) => <Input {...props} maxLength={500} value={form.values.reason} disabled={mutation.isPending} onChange={(event) => form.setField('reason', event.target.value)} />}
    </Field>
      {Object.entries(form.errors).filter(([key]) => key !== 'reason').map(([key, message]) => <p key={key} role="alert" className="text-alert">{message}</p>)}
      <Button className="mt-sm" onClick={prepare} disabled={mutation.isPending || !Object.keys(records).length}>Review recovery confirmation</Button>
    </div>
    <MutationFeedback error={mutation.error} saved={mutation.isSuccess} operation="Confirming recovered captures"
      success={`${mutation.data?.cleared ?? 0} recovered captures cleared from this phone. Audit: ${mutation.data?.auditId ?? ''}`} />
    <ConfirmationDialog open={review !== null} title="Clear confirmed recovered captures" confirmLabel="Verify and clear selection"
      pending={mutation.isPending} onCancel={() => setReview(null)} onConfirm={confirm}>
      <p>{review?.entries.length} selected parked captures. Pending, sending and unselected captures stay on this phone.</p>
      <p className="mt-sm whitespace-pre-wrap">Note: {review?.reason}</p>
      <MutationFeedback error={mutation.error} operation="Confirming recovered captures" onRetry={confirm} />
    </ConfirmationDialog>
  </Stack>;
}

function SalvageSelection({ failed, records, update, disabled }: {
  failed: OutboxEntry[]; records: Record<string, string>; update(id: string, recordId: string | null): void; disabled: boolean;
}) {
  return <ul className="flex max-h-[40dvh] flex-col gap-sm overflow-y-auto">
    {failed.map((row) => <li key={row.id}>
      <Checkbox label={`Select capture ${row.id}`} checked={Object.hasOwn(records, row.id)} disabled={disabled || !salvageCaptureKind(row)}
        onChange={(event) => update(row.id, event.target.checked ? '' : null)} />
      {!salvageCaptureKind(row) ? <p className="text-caption">This capture type has no exact recovery proof. Keep it for your IC.</p> : null}
      {Object.hasOwn(records, row.id) ? <Field id={`recovered-${row.id}`} label="Retained server record ID">
        {(props) => <Input {...props} value={records[row.id]} maxLength={64} disabled={disabled} onChange={(event) => update(row.id, event.target.value)} />}
      </Field> : null}
    </li>)}
  </ul>;
}
