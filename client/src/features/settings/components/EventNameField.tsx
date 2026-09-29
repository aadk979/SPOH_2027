import type { ReactNode } from 'react';
import type { SettingsForm } from '../hooks/useSettingsForm';
import { Card, Field, Input, Section } from '@/shared/ui';

export function EventNameField({
  form,
  canEdit,
}: {
  form: SettingsForm;
  canEdit: boolean;
}): ReactNode {
  const { values, errors, setField } = form;
  return (
    <>
      <Section
        title="Event identity"
        description="Display name for the event, used in reports, exports and the ops-room display."
      >
        <Card variant="flat">
          <Field id="event-name" label="Event name" error={errors.eventName}>
            {(props) => (
              <Input
                {...props}
                disabled={!canEdit}
                value={values.eventName}
                onChange={(event) => setField('eventName', event.target.value)}
                maxLength={80}
                placeholder="SPOH 2027"
              />
            )}
          </Field>
        </Card>
      </Section>
    </>
  );
}
