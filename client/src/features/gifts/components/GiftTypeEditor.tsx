'use client';
import { UpdateGiftTypeRequest, type GiftTypeRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, Checkbox, Callout } from '@/shared/ui';
import { useGiftAdmin } from '../queries';
export function GiftTypeEditor({ gift }: { gift: GiftTypeRecord }) {
  const form = useZodForm(UpdateGiftTypeRequest, { name: gift.name, lowStockThreshold: gift.lowStockThreshold, active: gift.active });
  const { update } = useGiftAdmin();
  return <form className="flex flex-col gap-sm" onSubmit={(event) => {
    event.preventDefault(); const body = form.validate(); if (body) update.mutate({ id: gift.id, body });
  }}>
    <Field id={`gift-label-${gift.id}`} label="Gift name" error={form.errors.name}>
      {(props) => <Input {...props} value={form.values.name} onChange={(e) => form.setField('name', e.target.value)} />}
    </Field>
    <Field id={`gift-low-${gift.id}`} label="Low-stock threshold" error={form.errors.lowStockThreshold}>
      {(props) => <Input {...props} type="number" min={0} value={form.values.lowStockThreshold} onChange={(e) => form.setField('lowStockThreshold', Number(e.target.value))} />}
    </Field>
    <Checkbox label="Active at the gift desk" checked={form.values.active} onChange={(e) => form.setField('active', e.target.checked)} />
    {update.isError ? <Callout>Could not save the gift type. Reload its current details and try again.</Callout> : null}
    {update.isSuccess ? <p role="status">Gift type saved.</p> : null}
    <Button type="submit" variant="secondary" disabled={update.isPending}>Save gift type</Button>
  </form>;
}
