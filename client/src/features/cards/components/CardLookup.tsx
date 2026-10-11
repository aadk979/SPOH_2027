'use client';
import { CardLookupParams } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, Callout } from '@/shared/ui';
import { useCardLookup } from '../queries';
import { CardCorrections } from './CardCorrections';
import { CardIssue } from './CardIssue';
export function CardLookup() {
  const form = useZodForm(CardLookupParams, { shortCode: '' });
  const lookup = useCardLookup();
  return (
    <div className="flex flex-col gap-md">
      <form
        className="flex flex-col gap-sm"
        onSubmit={(event) => {
          event.preventDefault();
          const body = form.validate();
          if (body) lookup.mutate(body.shortCode);
        }}
      >
        <Field id="card-lookup" label="Printed card code" error={form.errors.shortCode}>
          {(props) => (
            <Input
              {...props}
              value={form.values.shortCode}
              onChange={(e) => form.setField('shortCode', e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={lookup.isPending}>
          Find card
        </Button>
      </form>
      {lookup.isError ? (
        <Callout>Card not found or unavailable. Check the printed code and current event.</Callout>
      ) : null}
      {lookup.data ? (
        <div>
          <h3>
            {lookup.data.shortCode}: {lookup.data.status}
          </h3>
          <p>
            {lookup.data.stamps.length} stamps ·{' '}
            {lookup.data.redeemed ? 'Gift redeemed' : 'No gift redeemed'} ·{' '}
            {lookup.data.rehearsal ? 'Rehearsal' : 'Live'}
          </p>
          <CardCorrections
            key={lookup.data.id}
            card={lookup.data}
            onChange={(card) => lookup.mutate(card.shortCode)}
          />
          <CardIssue
            key={`issue-${lookup.data.id}`}
            card={lookup.data}
            onIssued={(card) => lookup.mutate(card.shortCode)}
          />
        </div>
      ) : null}
    </div>
  );
}
