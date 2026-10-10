import type { ReactNode } from 'react';
import type { EventContent } from '@spoh/shared';
import type { FormErrors } from '@/shared/hooks/useZodForm';
import { Field, Select, Stack } from '@/shared/ui';
import { useStations } from '@/features/stations';
import { ContentTextField } from './ContentTextField';
import { ProgrammeQuestions } from './ProgrammeQuestions';
type Programme = EventContent['brief']['programmes'][number];
export function ProgrammeFields({
  programme,
  index,
  errors,
  onChange,
}: {
  programme: Programme;
  index: number;
  errors: FormErrors;
  onChange(value: Programme): void;
}): ReactNode {
  const { data: stations } = useStations();
  const tags = [
    ...new Map(stations?.flatMap((station) => station.tags).map((tag) => [tag.id, tag])).values(),
  ];
  return (
    <Stack>
      <Field
        id={`programme-tag-${index}`}
        label={`Programme ${index + 1}: station tag`}
        hint="Tags group the stations for a programme. Set these up in Stations first."
        error={errors[`brief.programmes.${index}.stationTagId`]}
      >
        {(props) => (
          <Select
            {...props}
            value={programme.stationTagId}
            onChange={(event) => onChange({ ...programme, stationTagId: event.target.value })}
          >
            <option value="">Choose a programme tag</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <ContentTextField
        path={`brief.programmes.${index}.oneLiner`}
        label="Programme in one sentence"
        max={200}
        value={programme.oneLiner}
        error={errors[`brief.programmes.${index}.oneLiner`]}
        onChange={(oneLiner) => onChange({ ...programme, oneLiner })}
      />
      <ProgrammeQuestions programme={programme} index={index} errors={errors} onChange={onChange} />
    </Stack>
  );
}
