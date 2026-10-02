import { useEvent } from '@/shared/lib/eventContext';
import { Checkbox } from '@/shared/ui';

/** Also available when an older closed event has no frozen report to display. */
export function CurrentReportControl({
  current,
  onChange,
}: {
  current: boolean;
  onChange(value: boolean): void;
}) {
  const event = useEvent();
  if (event.status !== 'CLOSED' && event.status !== 'ARCHIVED') return null;
  return (
    <div className="mb-md">
      <Checkbox
        label="Show current data after close"
        checked={current}
        onChange={(input) => onChange(input.target.checked)}
      />
    </div>
  );
}
