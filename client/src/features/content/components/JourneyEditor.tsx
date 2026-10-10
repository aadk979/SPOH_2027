import type { ReactNode } from 'react';
import { Button, Section, Stack } from '@/shared/ui';
import { ContentTextField } from './ContentTextField';
import { replaceItem, type ContentSectionProps } from '../model/contentEditor';
export function JourneyEditor({
  value,
  errors,
  onChange,
}: ContentSectionProps<'journey'>): ReactNode {
  return (
    <Section title="Visitor journey">
      <Stack>
        {value.steps.map((step, index) => (
          <Stack key={index}>
            <ContentTextField
              path={`journey.steps.${index}.title`}
              label={`Step ${index + 1}: title`}
              max={40}
              value={step.title}
              error={errors[`journey.steps.${index}.title`]}
              onChange={(title) =>
                onChange({ ...value, steps: replaceItem(value.steps, index, { ...step, title }) })
              }
            />
            <ContentTextField
              path={`journey.steps.${index}.detail`}
              label={`Step ${index + 1}: explanation`}
              max={200}
              value={step.detail}
              error={errors[`journey.steps.${index}.detail`]}
              onChange={(detail) =>
                onChange({ ...value, steps: replaceItem(value.steps, index, { ...step, detail }) })
              }
            />
            <Button
              type="button"
              variant="quiet"
              disabled={value.steps.length === 1}
              onClick={() =>
                onChange({ ...value, steps: value.steps.filter((_, i) => i !== index) })
              }
            >
              Remove step {index + 1}
            </Button>
          </Stack>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={value.steps.length >= 10}
          onClick={() => onChange({ ...value, steps: [...value.steps, { title: '', detail: '' }] })}
        >
          Add journey step
        </Button>
        <ContentTextField
          path="journey.note"
          label="Journey note"
          max={300}
          value={value.note ?? ''}
          error={errors['journey.note']}
          onChange={(note) => onChange({ ...value, note: note.trim() ? note : undefined })}
        />
      </Stack>
    </Section>
  );
}
