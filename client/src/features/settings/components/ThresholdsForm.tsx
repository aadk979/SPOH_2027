import type { ReactNode } from 'react';
import type { SettingsForm } from '../hooks/useSettingsForm';
import { Card, Field, Input, Section } from '@/shared/ui';
import { NUMERIC_FIELDS } from '../model/numericFields';
export function ThresholdsForm({
  form,
  canEdit,
}: {
  form: SettingsForm;
  canEdit: boolean;
}): ReactNode {
  const { values, errors, setField, settings } = form;
  const overridden = new Set(settings.data?.overriddenKeys ?? []);
  return (
    <>
      <Section
        title="Thresholds"
        description="A value in bold has been changed from what the system shipped with."
      >
        <div className="flex flex-col gap-sm">
          {NUMERIC_FIELDS.map((field) => {
            const isChanged = overridden.has(field.key);
            return (
              <Card
                key={field.key}
                variant="flat"
                className={isChanged ? 'border-primary/40' : undefined}
              >
                <Field
                  id={field.key}
                  label={field.label}
                  hint={field.hint}
                  error={errors[field.key]}
                >
                  {(props) => (
                    <div className="flex items-center gap-sm">
                      <Input
                        {...props}
                        type="number"
                        inputMode="numeric"
                        min={field.min}
                        max={field.max}
                        disabled={!canEdit}
                        value={(values[field.key] as string | undefined) ?? ''}
                        onChange={(event) => setField(field.key, event.target.value)}
                        className={`max-w-[140px] ${isChanged ? 'font-bold text-primary' : ''}`}
                      />
                      <span
                        className={`text-caption ${
                          isChanged ? 'font-semibold text-primary' : 'text-text-muted'
                        }`}
                      >
                        {field.unit}
                        {isChanged ? ' (changed from default)' : ''}
                      </span>
                    </div>
                  )}
                </Field>
              </Card>
            );
          })}
        </div>
      </Section>
    </>
  );
}
