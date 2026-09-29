import type { ReactNode } from 'react';
import { Field, Input } from '@/shared/ui';
export function ShiftRow({
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  value: { start: string; end: string };
  /** Schema errors for the block; shown under its end time, which the ordering rule names. */
  error?: string;
  disabled: boolean;
  onChange(next: { start: string; end: string }): void;
}): ReactNode {
  return (
    <div className="grid gap-sm sm:grid-cols-2">
      <Field id={`${label}-start`} label={`${label} starts`}>
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
      <Field id={`${label}-end`} label={`${label} ends`} error={error}>
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
