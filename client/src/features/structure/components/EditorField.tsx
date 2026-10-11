import { useId } from 'react';
import { Field, Input } from '@/shared/ui';
export function EditorField(props: {
  label: string;
  value: string | number;
  onChange(value: string): void;
  error?: string;
  hint?: string;
  type?: 'text' | 'date' | 'time' | 'number';
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field id={id} label={props.label} error={props.error} hint={props.hint}>
      {(wiring) => (
        <Input
          {...wiring}
          type={props.type ?? 'text'}
          value={props.value}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
