import { Checkbox, Field, Input, Select } from '@/shared/ui';
import {
  catalogueFieldHint,
  type CatalogueField,
  type CatalogueInput,
} from '../model/catalogueEdit';

type Props = {
  field: CatalogueField;
  value: CatalogueInput;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: CatalogueInput) => void;
};
export function CatalogueProposedField(input: Props) {
  if (input.field.kind === 'multiple')
    return <CatalogueMultipleField {...input} field={input.field} />;
  if (input.field.kind === 'boolean')
    return (
      <Checkbox
        label="Proposed value"
        checked={input.value === true}
        disabled={input.disabled}
        onChange={(event) => input.onChange(event.target.checked)}
      />
    );
  const field = input.field;
  const value = typeof input.value === 'string' ? input.value : '';
  return (
    <Field
      id="catalogue-proposed"
      label="Proposed value"
      hint={catalogueFieldHint(field)}
      error={input.error}
    >
      {(props) =>
        field.kind === 'choice' ? (
          <Select
            {...props}
            disabled={input.disabled}
            value={value}
            onChange={(event) => input.onChange(event.target.value)}
          >
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            {...props}
            disabled={input.disabled}
            value={value}
            type={field.kind === 'number' ? 'number' : 'text'}
            min={field.kind === 'number' ? field.minimum : undefined}
            max={field.kind === 'number' ? field.maximum : undefined}
            step={field.kind === 'number' ? field.step : undefined}
            minLength={field.kind === 'text' ? field.minimum : undefined}
            maxLength={field.kind === 'text' ? field.maximum : undefined}
            onChange={(event) => input.onChange(event.target.value)}
          />
        )
      }
    </Field>
  );
}
function CatalogueMultipleField(
  input: Props & { field: Extract<CatalogueField, { kind: 'multiple' }> },
) {
  const selected = Array.isArray(input.value) ? input.value : [];
  return (
    <fieldset
      disabled={input.disabled}
      aria-invalid={input.error ? true : undefined}
      aria-describedby={input.error ? 'catalogue-proposed-error' : undefined}
      className="flex min-w-0 flex-col gap-sm"
    >
      <legend className="text-body font-semibold">Proposed value</legend>
      <p className="text-caption">
        Select up to {input.field.maximum}. Leaving all options clear selects none.
      </p>
      {input.field.options.map((option) => (
        <Checkbox
          key={option}
          label={option}
          checked={selected.includes(option)}
          disabled={input.disabled}
          onChange={(event) =>
            input.onChange(
              event.target.checked
                ? [...selected, option]
                : selected.filter((value) => value !== option),
            )
          }
        />
      ))}
      {input.error ? (
        <p id="catalogue-proposed-error" role="alert" className="text-alert">
          {input.error}
        </p>
      ) : null}
    </fieldset>
  );
}
