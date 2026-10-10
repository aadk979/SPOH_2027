import type { ReactNode } from 'react';
import { Button, Section, Stack } from '@/shared/ui';
import { replaceItem, type ContentSectionProps } from '../model/contentEditor';
import { ProgrammeFields } from './ProgrammeFields';
export function ProgrammeEditor({
  value,
  errors,
  onChange,
}: ContentSectionProps<'brief'>): ReactNode {
  return (
    <Section title="Programme explanations">
      <Stack>
        {value.programmes.map((programme, index) => (
          <Stack key={index}>
            <ProgrammeFields
              programme={programme}
              index={index}
              errors={errors}
              onChange={(next) =>
                onChange({ ...value, programmes: replaceItem(value.programmes, index, next) })
              }
            />
            <Button
              type="button"
              variant="quiet"
              onClick={() =>
                onChange({ ...value, programmes: value.programmes.filter((_, i) => i !== index) })
              }
            >
              Remove programme {index + 1}
            </Button>
          </Stack>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={value.programmes.length >= 30}
          onClick={() =>
            onChange({
              ...value,
              programmes: [...value.programmes, { stationTagId: '', oneLiner: '', faqs: [] }],
            })
          }
        >
          Add programme
        </Button>
      </Stack>
    </Section>
  );
}
