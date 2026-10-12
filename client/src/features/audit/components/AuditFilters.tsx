import { Button, Card, Field, Input, Stack, ErrorState } from '@/shared/ui';
import type { useAuditFilters } from '../hooks/useAuditFilters';

export function AuditFilters({ control }: { control: ReturnType<typeof useAuditFilters> }) {
  const { form } = control;
  return (
    <Card>
      <Stack>
        <div className="grid gap-md sm:grid-cols-2">
          {(['action', 'entityType', 'entityId', 'actorId'] as const).map((field) => (
            <Field
              key={field}
              id={`audit-${field}`}
              label={labels[field]}
              error={form.errors[field]}
              optional
            >
              {(props) => (
                <Input
                  {...props}
                  value={form.values[field]}
                  maxLength={64}
                  onChange={(event) => form.setField(field, event.target.value)}
                />
              )}
            </Field>
          ))}
          {(['fromWall', 'toWall'] as const).map((field) => (
            <Field
              key={field}
              id={`audit-${field}`}
              label={`${field === 'fromWall' ? 'From (inclusive)' : 'Until (exclusive)'} · ${control.timezone}`}
              error={form.errors[field]}
              optional
            >
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={form.values[field]}
                  onChange={(event) => form.setField(field, event.target.value)}
                />
              )}
            </Field>
          ))}
        </div>
        <Button onClick={control.apply}>Apply audit filters</Button>
        {control.error ? (
          <ErrorState error={control.error}>{control.error}</ErrorState>
        ) : null}
      </Stack>
    </Card>
  );
}
const labels = {
  action: 'Action',
  entityType: 'Record type',
  entityId: 'Record ID',
  actorId: 'Person ID',
};
