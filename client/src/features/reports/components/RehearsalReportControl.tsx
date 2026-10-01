import { Callout, Checkbox } from '@/shared/ui';

export function RehearsalReportControl({
  included,
  onChange,
}: {
  included: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <div className="mb-md flex flex-col gap-sm">
      <Checkbox
        label="Show rehearsal data"
        checked={included}
        onChange={(event) => onChange(event.target.checked)}
      />
      {included ? (
        <Callout tone="warn" title="Includes rehearsal data">
          Totals combine live and practice captures. Gift stock pools remain separate.
        </Callout>
      ) : (
        <p className="text-caption text-text-muted">Rehearsal data is excluded.</p>
      )}
    </div>
  );
}
