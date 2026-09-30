import type { ReactNode } from 'react';
import type { IncidentFormState } from '../hooks/useIncidentForm';
import { Field, Textarea, Input } from '@/shared/ui';
export function IncidentDetails({ form }: { form: IncidentFormState }): ReactNode {
  const { description, setDescription, descriptionError, locationNote, setLocationNote, me } = form;
  return (
    <>
      <Field
        id="description"
        label="What happened?"
        hint="Describe the event, not the people. No names. Minimum 10 characters."
        error={descriptionError}
      >
        {(props) => (
          <Textarea
            {...props}
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            placeholder="A cable across the walkway was taped down after someone tripped on it."
          />
        )}
      </Field>

      <Field
        id="location"
        error={form.errors.locationNote}
        label="Where, exactly?"
        optional
        hint={
          me?.currentAssignment
            ? `Recorded against ${me.currentAssignment.station.name}. Add the detail that would help someone find the spot.`
            : 'Add the detail that would help someone find the spot.'
        }
      >
        {(props) => (
          <Input
            {...props}
            value={locationNote}
            onChange={(event) => setLocationNote(event.target.value)}
            placeholder={
              me?.currentAssignment
                ? `Near the entrance to ${me.currentAssignment.station.name}`
                : 'Level 2 walkway, by the lifts'
            }
            maxLength={200}
          />
        )}
      </Field>
    </>
  );
}
