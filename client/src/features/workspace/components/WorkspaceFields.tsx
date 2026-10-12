import type { WorkspaceField } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { fieldValue } from '../model/presentation';

export function WorkspaceFields({ fields }: { fields: WorkspaceField[] }) {
  const time = useEventTime();
  return <dl className="grid gap-sm sm:grid-cols-2">
    {fields.map((field, index) => <div key={`${field.label}-${index}`} className="min-w-0">
      <dt className="text-caption text-text-muted">{field.label}</dt>
      <dd className="break-words whitespace-pre-wrap">{field.format === 'instant' && typeof field.value === 'string'
        ? time.dateTime(field.value) : fieldValue(field)}</dd>
    </div>)}
  </dl>;
}
