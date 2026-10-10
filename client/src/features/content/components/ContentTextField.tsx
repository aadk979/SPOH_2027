import type { ReactNode } from 'react';
import { Field, Textarea } from '@/shared/ui';
export function ContentTextField(props: {
  path: string;
  label: string;
  value: string;
  onChange(value: string): void;
  max: number;
  error?: string;
  hint?: string;
}): ReactNode {
  return (
    <Field id={`content-${props.path}`} label={props.label} error={props.error} hint={props.hint}>
      {(wiring) => (
        <Textarea
          {...wiring}
          value={props.value}
          maxLength={props.max}
          rows={2}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
