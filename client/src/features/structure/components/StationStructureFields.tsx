import { useId } from 'react';
import type { StructureResponse } from '@spoh/shared';
import { Checkbox, ControlHelp, Field, Select } from '@/shared/ui';
export function StationStructureFields(props: {
  structure: StructureResponse['data'];
  typeCode: string;
  tagCodes: string[];
  onTypeChange(value: string): void;
  onTagsChange(value: string[]): void;
  errors: Record<string, string | undefined>;
  disabled: boolean;
}) {
  const id = useId();
  const types = props.structure.stationTypes.filter(
    (type) => type.active || type.code === props.typeCode,
  );
  const tags = props.structure.stationTags.filter(
    (tag) => tag.active || props.tagCodes.includes(tag.code),
  );
  return (
    <>
      <Field
        id={id}
        label="Station type"
        error={props.errors.typeCode}
        hint="The type’s capabilities decide the capture tools offered at this station."
      >
        {(wiring) => (
          <Select
            {...wiring}
            value={props.typeCode}
            disabled={props.disabled}
            onChange={(event) => props.onTypeChange(event.target.value)}
          >
            <option value="">Choose a type</option>
            {types.map((type) => (
              <option key={type.id} value={type.code}>
                {type.label}
                {type.active ? '' : ' (inactive)'}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset disabled={props.disabled} aria-describedby={`${id}-tags-help`}>
        <legend className="font-semibold">Station tags</legend>
        <ControlHelp id={`${id}-tags-help`}>Tags group stations for filters and audience choices. They do not change the station type's capture tools.</ControlHelp>
        {tags.length === 0 ? (
          <p className="text-text-muted">Create a tag below to group stations.</p>
        ) : null}
        {tags.map((tag) => (
          <Checkbox
            key={tag.id}
            label={`${tag.label}${tag.active ? '' : ' (inactive)'}`}
            checked={props.tagCodes.includes(tag.code)}
            onChange={(event) =>
              props.onTagsChange(
                event.target.checked
                  ? [...props.tagCodes, tag.code]
                  : props.tagCodes.filter((code) => code !== tag.code),
              )
            }
          />
        ))}
        {props.errors.tagCodes ? (
          <p role="alert" className="text-alert">
            {props.errors.tagCodes}
          </p>
        ) : null}
      </fieldset>
    </>
  );
}
