import type { ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingRows } from '@/shared/ui';
import { useVisitorFields } from '../queries';
import { CreateVisitorFieldForm } from './CreateVisitorFieldForm';
import { VisitorFieldRow } from './VisitorFieldRow';
import { VisitorRecordsPanel } from './VisitorRecordsPanel';

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
  if (fields.error) return <ErrorState error={fields.error} operation="Loading visitor fields" onRetry={() => void fields.refetch()} />;
  return (
    <section className="flex flex-col gap-md">
      <h3 className="font-display text-section">Fields this event collects</h3>
      <p className="text-text-muted">
        Only these fields can be collected. Each value is kept apart from the counts and removed
        after its retention period. Collection needs a network connection.
      </p>
      {fields.isPending ? <LoadingRows /> : null}
      {fields.data?.length === 0 ? <EmptyState title="No visitor fields">Only counts are collected until you declare an allowed field.</EmptyState> : null}
      {fields.data?.map((field) => (
        <VisitorFieldRow key={field.id} field={field} canEdit={canEdit} />
      ))}
      {canEdit ? <CreateVisitorFieldForm /> : null}
      <VisitorRecordsPanel />
    </section>
  );
}
