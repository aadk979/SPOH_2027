import type { ReactNode } from 'react';
import { Button, Section, Stack } from '@/shared/ui';
import { ContentTextField } from './ContentTextField';
import { replaceItem, type ContentSectionProps } from '../model/contentEditor';
import { ProgrammeEditor } from './ProgrammeEditor';
export function BriefEditor({ value, errors, onChange }: ContentSectionProps<'brief'>): ReactNode {
  return (
    <Section title="What do I say">
      <Stack>
        <ContentTextField
          path="brief.escalationScript"
          label="When you do not know"
          max={400}
          hint="Give volunteers words they can say aloud, and where to get help."
          value={value.escalationScript}
          error={errors['brief.escalationScript']}
          onChange={(escalationScript) => onChange({ ...value, escalationScript })}
        />
        {value.fiveThings.map((thing, index) => (
          <Stack key={index}>
            <ContentTextField
              path={`brief.fiveThings.${index}.text`}
              label={`Essential point ${index + 1}`}
              max={160}
              value={thing.text}
              error={errors[`brief.fiveThings.${index}.text`]}
              onChange={(text) =>
                onChange({
                  ...value,
                  fiveThings: replaceItem(value.fiveThings, index, { ...thing, text }),
                })
              }
            />
            <Button
              type="button"
              variant="quiet"
              disabled={value.fiveThings.length === 1}
              onClick={() =>
                onChange({ ...value, fiveThings: value.fiveThings.filter((_, i) => i !== index) })
              }
            >
              Remove point {index + 1}
            </Button>
          </Stack>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={value.fiveThings.length >= 7}
          onClick={() => onChange({ ...value, fiveThings: [...value.fiveThings, { text: '' }] })}
        >
          Add essential point
        </Button>
        <ProgrammeEditor value={value} errors={errors} onChange={onChange} />
      </Stack>
    </Section>
  );
}
