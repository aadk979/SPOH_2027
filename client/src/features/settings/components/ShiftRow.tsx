import type { ReactNode } from 'react';
import { Field, Input } from '@/shared/ui';
export function ShiftRow({
  id,
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  /** Unique on the page; the shift's code. */
  id: string;
  label: string;
  value: { start: string; end: string };
  /** The hours' error; shown under the end time, which the ordering rule names. */
  error?: string;
  disabled: boolean;
  onChange(next: { start: string; end: string }): void;
}): ReactNode {
  return (
    <div className="grid gap-sm sm:grid-cols-2">
      <Field id={`${id}-start`} label={`${label} starts`}>
        {(props) => (
          <Input
            {...props}
            type="time"
            disabled={disabled}
            value={value.start}
            onChange={(event) => onChange({ ...value, start: event.target.value })}
          />
        )}
      </Field>
      <Field id={`${id}-end`} label={`${label} ends`} error={error}>
        {(props) => (
          <Input
            {...props}
            type="time"
            disabled={disabled}
            value={value.end}
            onChange={(event) => onChange({ ...value, end: event.target.value })}
          />
        )}
      </Field>
    </div>
  );
}
