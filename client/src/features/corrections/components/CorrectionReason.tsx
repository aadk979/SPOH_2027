import { Field, Textarea } from '@/shared/ui';

export function CorrectionReason({
  id,
  value,
  error,
  onChange,
}: {
  id: string;
  value: string;
  error?: string;
  onChange(value: string): void;
}) {
  return (
    <Field
      id={id}
      label="Reason"
      hint="Explain the correction. Do not include visitor names."
      error={error}
    >
      {(props) => (
        <Textarea
          {...props}
          value={value}
          maxLength={500}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
