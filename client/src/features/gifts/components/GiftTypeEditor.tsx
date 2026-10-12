'use client';
import { UpdateGiftTypeRequest, type GiftTypeRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, ControlHelp, Field, Input, Checkbox, ErrorState } from '@/shared/ui';
import { useGiftAdmin } from '../queries';
export function GiftTypeEditor({ gift }: { gift: GiftTypeRecord }) {
  const form = useZodForm(UpdateGiftTypeRequest, { name: gift.name, lowStockThreshold: gift.lowStockThreshold, active: gift.active });
  const { update } = useGiftAdmin();
  return <form className="flex flex-col gap-sm" onSubmit={(event) => {
    event.preventDefault(); const body = form.validate(); if (body) update.mutate({ id: gift.id, body });
  }}>
    <Field id={`gift-label-${gift.id}`} label="Gift name" hint="The name shown at the gift desk. Frozen exports retain their saved label." error={form.errors.name}>
      {(props) => <Input {...props} value={form.values.name} onChange={(e) => form.setField('name', e.target.value)} />}
    </Field>
    <Field id={`gift-low-${gift.id}`} label="Low-stock threshold" hint="Warn when the remaining stock reaches this value. This does not add stock." error={form.errors.lowStockThreshold}>
      {(props) => <Input {...props} type="number" min={0} value={form.values.lowStockThreshold} onChange={(e) => form.setField('lowStockThreshold', Number(e.target.value))} />}
    </Field>
    <Checkbox label="Active at the gift desk" aria-describedby={`gift-active-help-${gift.id}`} checked={form.values.active} onChange={(e) => form.setField('active', e.target.checked)} />
    <ControlHelp id={`gift-active-help-${gift.id}`} topic="stock">Turning this off removes the gift from new handovers; retained stock and redemption history remain.</ControlHelp>
    {update.isError ? <ErrorState error={update.error}>Could not save the gift type. Reload its current details and try again.</ErrorState> : null}
    {update.isSuccess ? <p role="status">Gift type saved.</p> : null}
    <Button type="submit" variant="secondary" disabled={update.isPending}>Save gift type</Button>
  </form>;
}
