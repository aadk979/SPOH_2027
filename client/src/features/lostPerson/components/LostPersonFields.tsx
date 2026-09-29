import type { ReactNode } from 'react';
import type { LostPersonFormState } from '../hooks/useLostPersonForm';
import { Field, Input, Textarea } from '@/shared/ui';
export function LostPersonFields({ form }: { form: LostPersonFormState }): ReactNode {
  const {
    description,
    setDescription,
    approxAge,
    setApproxAge,
    clothing,
    setClothing,
    descriptionError,
  } = form;
  return (
    <>
      <Field
        id="description"
        label="What has happened, and who are we looking for?"
        error={descriptionError}
      >
        {(props) => (
          <Textarea
            {...props}
            required
            minLength={3}
            maxLength={500}
            rows={3}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            placeholder="Child separated from their group near the Welcome Lounge"
          />
        )}
      </Field>

      {/*
          Age and clothing sit side by side once there is room: they are the two
          things a searcher scans the floor for, and on the banner they are read
          together.
        */}
      <div className="grid gap-md sm:grid-cols-2">
        <Field id="age" error={form.errors.approxAge} label="Approximate age" optional>
          {(props) => (
            <Input
              {...props}
              value={approxAge}
              onChange={(event) => setApproxAge(event.target.value)}
              placeholder="about 8"
            />
          )}
        </Field>

        <Field
          id="clothing"
          error={form.errors.clothingText}
          label="What are they wearing?"
          optional
        >
          {(props) => (
            <Input
              {...props}
              value={clothing}
              onChange={(event) => setClothing(event.target.value)}
              placeholder="red jacket, dark jeans"
            />
          )}
        </Field>
      </div>
    </>
  );
}
