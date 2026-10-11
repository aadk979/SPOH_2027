'use client';
import { CreateGiftTypeRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, Callout } from '@/shared/ui';
import { useGiftAdmin } from '../queries';

export function CreateGiftForm() {
  const form = useZodForm(CreateGiftTypeRequest, { name: '', initialStock: 0, lowStockThreshold: 50 });
  const { create } = useGiftAdmin();
  return <form className="flex flex-col gap-md" onSubmit={(event) => {
    event.preventDefault(); const body = form.validate();
    if (body) create.mutate(body, { onSuccess: () => form.reset() });
  }}>
    <Field id="gift-name" label="Gift name" hint="The name volunteers see at the gift desk." error={form.errors.name}>
      {(props) => <Input {...props} value={form.values.name} onChange={(e) => form.setField('name', e.target.value)} />}
    </Field>
    <Field id="gift-opening" label="Opening stock" hint="Use adjustments with reasons for later deliveries or recounts." error={form.errors.initialStock}>
      {(props) => <Input {...props} type="number" min={0} max={1000000} value={form.values.initialStock} onChange={(e) => form.setField('initialStock', Number(e.target.value))} />}
    </Field>
    <Field id="gift-threshold" label="Low-stock threshold" hint="Warn the team when stock reaches this number." error={form.errors.lowStockThreshold}>
      {(props) => <Input {...props} type="number" min={0} max={1000000} value={form.values.lowStockThreshold} onChange={(e) => form.setField('lowStockThreshold', Number(e.target.value))} />}
    </Field>
    {create.isError ? <Callout>Could not create this gift. Check its name and try again.</Callout> : null}
    <Button type="submit" disabled={create.isPending}>Add gift type</Button>
  </form>;
}
