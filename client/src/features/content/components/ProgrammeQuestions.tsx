import type { ReactNode } from 'react';
import type { EventContent } from '@spoh/shared';
import type { FormErrors } from '@/shared/hooks/useZodForm';
import { Button, Stack } from '@/shared/ui';
import { ContentTextField } from './ContentTextField';
import { replaceItem } from '../model/contentEditor';
type Programme = EventContent['brief']['programmes'][number];
export function ProgrammeQuestions({
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
  return (
    <Stack>
      {programme.faqs.map((faq, i) => (
        <Stack key={i}>
          <ContentTextField
            path={`brief.programmes.${index}.faqs.${i}.question`}
            label={`Question ${i + 1}`}
            max={120}
            value={faq.question}
            error={errors[`brief.programmes.${index}.faqs.${i}.question`]}
            onChange={(question) =>
              onChange({ ...programme, faqs: replaceItem(programme.faqs, i, { ...faq, question }) })
            }
          />
          <ContentTextField
            path={`brief.programmes.${index}.faqs.${i}.answer`}
            label={`Answer ${i + 1}`}
            max={300}
            value={faq.answer}
            error={errors[`brief.programmes.${index}.faqs.${i}.answer`]}
            onChange={(answer) =>
              onChange({ ...programme, faqs: replaceItem(programme.faqs, i, { ...faq, answer }) })
            }
          />
          <Button
            type="button"
            variant="quiet"
            onClick={() =>
              onChange({ ...programme, faqs: programme.faqs.filter((_, n) => n !== i) })
            }
          >
            Remove question {i + 1}
          </Button>
        </Stack>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={programme.faqs.length >= 5}
        onClick={() =>
          onChange({ ...programme, faqs: [...programme.faqs, { question: '', answer: '' }] })
        }
      >
        Add question
      </Button>
    </Stack>
  );
}
