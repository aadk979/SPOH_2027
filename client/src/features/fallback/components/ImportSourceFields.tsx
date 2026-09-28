import type { ReactNode } from 'react';
import type { ImportForm } from '../hooks/useImportForm';
import { ChoiceGroup } from '@/shared/ui';
export function ImportSourceFields({ form }: { form: ImportForm }): ReactNode {
  const { target, setTarget, source, setSource, invalidatePreview } = form;
  return (
    <>
      <ChoiceGroup
        legend="What are you importing?"
        name="import-target"
        value={target}
        onChange={(value) => {
          setTarget(value);
          invalidatePreview();
        }}
        options={[
          { value: 'registrations', label: 'Registrations' },
          { value: 'footfall', label: 'Room entries' },
        ]}
      />

      <ChoiceGroup
        legend="Where did it come from?"
        name="import-source"
        value={source}
        onChange={(value) => {
          setSource(value);
          invalidatePreview();
        }}
        options={[
          { value: 'FALLBACK_SHEET', label: 'Google fallback sheet' },
          { value: 'PAPER', label: 'Paper tally' },
        ]}
      />
    </>
  );
}
