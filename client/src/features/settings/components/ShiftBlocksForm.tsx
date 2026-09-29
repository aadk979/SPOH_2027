import type { ReactNode } from 'react';
import type { SettingsForm } from '../hooks/useSettingsForm';
import { Card, Section } from '@/shared/ui';
import { ShiftRow } from './ShiftRow';
export function ShiftBlocksForm({
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
        title="Shift blocks"
        description="Singapore time. A capture screen only works while the volunteer is rostered on a block that is running, so these two rows decide when the system accepts data at all. They are allowed to overlap — the handover is deliberate."
      >
        <Card className="flex flex-col gap-md">
          <ShiftRow
            label="Morning"
            value={values.morning}
            error={errors.morning}
            disabled={!canEdit}
            onChange={(next) => setField('morning', next)}
          />
          <ShiftRow
            label="Afternoon"
            value={values.afternoon}
            error={errors.afternoon}
            disabled={!canEdit}
            onChange={(next) => setField('afternoon', next)}
          />
        </Card>
      </Section>
    </>
  );
}
