import { Callout, Checkbox } from '@/shared/ui';

/** A deliberate selection on each dashboard; polling keeps the same provenance scope. */
export function RehearsalDashboardControl({
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
          Counts and activity warnings include practice captures. Gift stock pools remain separate.
        </Callout>
      ) : (
        <p className="text-caption">Rehearsal data is excluded.</p>
      )}
    </div>
  );
}
