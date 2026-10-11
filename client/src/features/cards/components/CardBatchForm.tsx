'use client';
import { GenerateCardBatchRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, Checkbox, Callout } from '@/shared/ui';
import { useCardPrinting } from '../queries';
function PrintResults({ printing }: { printing: ReturnType<typeof useCardPrinting> }) {
  const { generate, print, download } = printing;
  const codes =
    generate.data?.csv
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map((line) => line.split(',')[0]!) ?? [];
  if (!generate.data) return null;
  return (
    <div className="flex flex-col gap-sm">
      <p role="status">
        {generate.data.created} {generate.data.rehearsal ? 'rehearsal' : 'live'} cards generated.
      </p>
      <p>
        Prepare a PDF or a ZIP containing the PDF and printer CSV. Storage must be configured by the
        platform administrator.
      </p>
      {(['pdf', 'zip'] as const).map((format) => (
        <Button
          key={format}
          variant="secondary"
          disabled={print.isPending || codes.length === 0}
          onClick={() => print.mutate({ shortCodes: codes, format })}
        >
          Prepare {format.toUpperCase()}
        </Button>
      ))}
      {print.isError ? (
        <Callout>Could not prepare the print file. Retry when export storage is available.</Callout>
      ) : null}
      {print.data ? (
        <Button disabled={download.isPending} onClick={() => download.mutate(print.data!)}>
          Download {print.data.format.toUpperCase()}
        </Button>
      ) : null}
      {download.isError ? <Callout>Could not download this print file. Try again.</Callout> : null}
    </div>
  );
}
export function CardBatchForm() {
  const form = useZodForm(GenerateCardBatchRequest.omit({ idempotencyKey: true }), {
    count: 100,
    batchLabel: '',
    rehearsal: false,
  });
  const printing = useCardPrinting();
  return (
    <div className="flex flex-col gap-md">
      <form
        className="flex flex-col gap-sm"
        onSubmit={(event) => {
          event.preventDefault();
          const body = form.validate();
          if (body) {
            printing.print.reset();
            printing.generate.mutate(body);
          }
        }}
      >
        <Field
          id="card-batch-label"
          label="Batch label"
          hint="Use a label that identifies this print run."
          error={form.errors.batchLabel}
        >
          {(props) => (
            <Input
              {...props}
              value={form.values.batchLabel}
              onChange={(e) => form.setField('batchLabel', e.target.value)}
            />
          )}
        </Field>
        <Field
          id="card-batch-count"
          label="Number of cards"
          hint="Print up to 5,000 unused codes in one batch."
          error={form.errors.count}
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={5000}
              value={form.values.count}
              onChange={(e) => form.setField('count', Number(e.target.value))}
            />
          )}
        </Field>
        <Checkbox
          label="Rehearsal cards"
          checked={form.values.rehearsal}
          onChange={(e) => form.setField('rehearsal', e.target.checked)}
        />
        {printing.generate.isError ? (
          <Callout>Generation was not confirmed. Retry the same batch to check its result.</Callout>
        ) : null}
        <Button type="submit" disabled={printing.generate.isPending || printing.print.isPending}>
          Generate card batch
        </Button>
      </form>
      <PrintResults printing={printing} />
    </div>
  );
}
