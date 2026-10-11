import type { ReactNode } from 'react';
import { Field, Input } from '@/shared/ui';
import { CaptureScheduleTimePreview } from './CaptureScheduleTimePreview';

export function ScheduleWallTimeField({
  id,
  label,
  timezone,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  timezone: string;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <>
      <Field id={id} label={`${label} (${timezone})`} error={error}>
        {(props) => (
          <Input
            {...props}
            type="datetime-local"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
      <CaptureScheduleTimePreview wallTime={value} timezone={timezone} />
    </>
  );
}
