import type { ReactNode } from 'react';
import { Button, Section, Stack } from '@/shared/ui';
import { ContentTextField } from './ContentTextField';
import { replaceItem, type ContentSectionProps } from '../model/contentEditor';
export function BriefingEditor({
  value,
  errors,
  onChange,
}: ContentSectionProps<'briefing'>): ReactNode {
  return (
    <Section title="Before each shift">
      <Stack>
        <p>These points are shown to volunteers before they start work.</p>
        {value.mandatoryPoints.map((point, index) => (
          <Stack key={index}>
            <ContentTextField
              path={`briefing.mandatoryPoints.${index}`}
              label={`Briefing point ${index + 1}`}
              max={160}
              value={point}
              error={errors[`briefing.mandatoryPoints.${index}`]}
              onChange={(next) =>
                onChange({ mandatoryPoints: replaceItem(value.mandatoryPoints, index, next) })
              }
            />
            <Button
              type="button"
              variant="quiet"
              disabled={value.mandatoryPoints.length === 1}
              onClick={() =>
                onChange({ mandatoryPoints: value.mandatoryPoints.filter((_, i) => i !== index) })
              }
            >
              Remove briefing point {index + 1}
            </Button>
          </Stack>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={value.mandatoryPoints.length >= 8}
          onClick={() => onChange({ mandatoryPoints: [...value.mandatoryPoints, ''] })}
        >
          Add briefing point
        </Button>
      </Stack>
    </Section>
  );
}
