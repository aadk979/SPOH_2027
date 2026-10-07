import type { ReactNode } from 'react';
import type { SettingsForm } from '../hooks/useSettingsForm';
import { Card, Field, Input, Section } from '@/shared/ui';
import { NUMERIC_FIELDS, type FieldSpec } from '../model/numericFields';
import { isRetiredLegacyKey, retiredLegacyHome } from '../model/retiredLegacyKeys';
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
            if (isRetiredLegacyKey(field.key))
              return <CataloguePointer key={field.key} field={field} />;
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
                        disabled={!canEdit || form.save.isPending}
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

/** A setting no longer written here; the legacy value is not shown as live. */
function CataloguePointer({ field }: { field: FieldSpec }): ReactNode {
  return (
    <Card variant="flat">
      <p className="font-semibold">{field.label}</p>
      <p className="text-caption text-text-muted">{field.hint}</p>
      <p className="text-caption text-text-muted">{pointerText(field)}</p>
    </Card>
  );
}

function pointerText(field: FieldSpec): string {
  const home = retiredLegacyHome(field.key);
  if (home === 'visitorData') return 'Changed under Counts and visitor data above, for this event.';
  if (home === 'organisation')
    return 'Changed under Organisation settings above, by a platform admin, for every event.';
  const scopes = field.stationScope ? 'event or station' : 'event';
  return `Changed in the Settings catalogue above, at ${scopes} scope.`;
}
