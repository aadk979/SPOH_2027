import type { ReactNode } from 'react';
import { LoadingRows } from '@/shared/ui';
import { useVisitorFields } from '../queries';
import { CreateVisitorFieldForm } from './CreateVisitorFieldForm';
import { VisitorFieldRow } from './VisitorFieldRow';

/** The allowlist and each field's retention and reader roles (ADR-002 §4). */
export function VisitorFieldEditor({
  enabled,
  canEdit,
}: {
  enabled: boolean;
  canEdit: boolean;
}): ReactNode {
  const fields = useVisitorFields(enabled);
  if (!enabled) return null;
  return (
    <section className="flex flex-col gap-md">
      <h3 className="font-display text-section">Fields this event collects</h3>
      <p className="text-text-muted">
        Only these fields can be collected. Each value is kept apart from the counts and removed
        after its retention period. Collection needs a network connection.
      </p>
      {fields.isPending ? <LoadingRows /> : null}
      {fields.isError ? <p role="alert">Could not load the declared fields.</p> : null}
      {fields.data?.map((field) => (
        <VisitorFieldRow key={field.id} field={field} canEdit={canEdit} />
      ))}
      {canEdit ? <CreateVisitorFieldForm /> : null}
    </section>
  );
}
