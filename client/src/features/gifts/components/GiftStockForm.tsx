'use client';
import { AdjustGiftStockRequest, type GiftTypeRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, Callout } from '@/shared/ui';
import { useGiftAdmin } from '../queries';
export function GiftStockForm({ gift }: { gift: GiftTypeRecord }) {
  const form = useZodForm(AdjustGiftStockRequest, { delta: 0, reason: '' });
  const { adjust } = useGiftAdmin();
  return <form className="flex flex-col gap-sm" onSubmit={(event) => {
    event.preventDefault(); const body = form.validate();
    if (body) adjust.mutate({ id: gift.id, body }, { onSuccess: () => form.reset() });
  }}>
    <Field id={`stock-delta-${gift.id}`} label="Stock change" hint="Positive for deliveries; negative for damage or a recount." error={form.errors.delta}>
      {(props) => <Input {...props} type="number" value={form.values.delta} onChange={(e) => form.setField('delta', Number(e.target.value))} />}
    </Field>
    <Field id={`stock-reason-${gift.id}`} label="Reason for stock change" hint="Describe the delivery or correction so the audit can explain the total." error={form.errors.reason}>
      {(props) => <Input {...props} value={form.values.reason} onChange={(e) => form.setField('reason', e.target.value)} />}
    </Field>
    {adjust.isError ? <Callout>Stock was not confirmed. Retry the same change to check its result safely.</Callout> : null}
    {adjust.isSuccess ? <p role="status">Stock change recorded.</p> : null}
    <Button type="submit" variant="secondary" disabled={adjust.isPending}>Record stock change</Button>
  </form>;
}
