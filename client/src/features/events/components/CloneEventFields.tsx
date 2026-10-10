import type { CloneEventParts } from '@spoh/shared';
import type { FormErrors } from '@/shared/hooks/useZodForm';
import { Checkbox, Field, Input, Stack } from '@/shared/ui';

export const COPY_PARTS: { key: keyof CloneEventParts; label: string }[] = [
  { key: 'categories', label: 'Visitor categories' },
  { key: 'stations', label: 'Stations, types and tags' },
  { key: 'daysAndShifts', label: 'Days and shifts' },
  { key: 'gifts', label: 'Gift types and stock plans' },
  { key: 'settings', label: 'Event and station settings' },
  { key: 'content', label: 'Published guide into a new draft' },
  { key: 'permissions', label: 'Role permissions (review required again)' },
];
export interface CloneValues {
  name: string;
  slug: string;
  dayOffsetDays: number;
  inviteSamePeople: boolean;
  copy: CloneEventParts;
  joinAsAdmin: boolean;
}
export function CloneEventFields({
  values,
  errors,
  change,
}: {
  values: CloneValues;
  errors: FormErrors;
  change: <Key extends keyof CloneValues>(key: Key, value: CloneValues[Key]) => void;
}) {
  return (
    <Stack>
      {(['name', 'slug'] as const).map((key) => (
        <Field
          key={key}
          id={`clone-${key}`}
          label={key === 'name' ? 'New event name' : 'New event address'}
          error={errors[key]}
        >
          {(props) => (
            <Input
              {...props}
              value={values[key]}
              onChange={(event) => change(key, event.target.value)}
            />
          )}
        </Field>
      ))}
      <Field
        id="clone-offset"
        label="Move every day by"
        hint="Number of days forward or backward. Event timezone stays the same."
        error={errors.dayOffsetDays}
      >
        {(props) => (
          <Input
            {...props}
            type="number"
            value={values.dayOffsetDays}
            onChange={(event) => change('dayOffsetDays', event.target.valueAsNumber)}
          />
        )}
      </Field>
      <fieldset>
        <legend className="font-semibold">Parts to copy</legend>
        {COPY_PARTS.map(({ key, label }) => (
          <Checkbox
            key={key}
            label={label}
            checked={values.copy[key]}
            onChange={(event) => change('copy', { ...values.copy, [key]: event.target.checked })}
          />
        ))}
      </fieldset>
      <Checkbox
        label="Invite the same active people"
        checked={values.inviteSamePeople}
        onChange={(event) => change('inviteSamePeople', event.target.checked)}
      />
      <Checkbox
        label="Join new event as Admin"
        checked={values.joinAsAdmin}
        onChange={(event) => change('joinAsAdmin', event.target.checked)}
      />
    </Stack>
  );
}
