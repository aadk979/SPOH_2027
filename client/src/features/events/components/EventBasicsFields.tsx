import type { FormErrors } from '@/shared/hooks/useZodForm';
import { Field, Input, Stack } from '@/shared/ui';

export interface EventBasics {
  name: string;
  slug: string;
  venue: string;
  timezone: string;
  startDate: string;
  endDate: string;
}
const FIELDS: { key: keyof EventBasics; label: string; type?: string; hint?: string }[] = [
  { key: 'name', label: 'Event name' },
  {
    key: 'slug',
    label: 'Event address',
    hint: 'Lower-case letters, digits and hyphens. This becomes the event link.',
  },
  { key: 'venue', label: 'Venue' },
  {
    key: 'timezone',
    label: 'Timezone',
    hint: 'An IANA timezone identifier. All event times use this.',
  },
  { key: 'startDate', label: 'First day', type: 'date' },
  { key: 'endDate', label: 'Last day', type: 'date' },
];

export function EventBasicsFields({
  values,
  errors,
  change,
}: {
  values: EventBasics;
  errors: FormErrors;
  change: (key: keyof EventBasics, value: string) => void;
}) {
  return (
    <Stack>
      {FIELDS.map(({ key, label, type, hint }) => (
        <Field key={key} id={`event-${key}`} label={label} hint={hint} error={errors[key]}>
          {(props) => (
            <Input
              {...props}
              type={type ?? 'text'}
              value={values[key]}
              onChange={(event) => change(key, event.target.value)}
            />
          )}
        </Field>
      ))}
    </Stack>
  );
}
