import type { ReactNode } from 'react';
import type { VolunteerAdminRecord } from '@spoh/shared';
import { useMe } from '@/features/session';
import { Button, Callout, Checkbox, Stack } from '@/shared/ui';
import { useBulkPeopleDraft } from '../hooks/useBulkPeopleDraft';
import { BulkPeopleFields } from './BulkPeopleFields';

export function BulkPeoplePanel({ rows }: { rows: VolunteerAdminRecord[] }): ReactNode {
  const { data: me } = useMe();
  const draft = useBulkPeopleDraft(rows.filter((row) => row.id !== me?.volunteer.id));
  return (
    <details className="rounded-md border border-line p-md">
      <summary className="min-h-control cursor-pointer font-semibold">
        Bulk actions for displayed people
      </summary>
      <fieldset disabled={draft.apply.isPending} className="mt-md">
        <Stack>
          <p>
            Select up to 100 people. Each person’s permissions are checked when the action runs.
          </p>
          {rows
            .filter((row) => row.id !== me?.volunteer.id)
            .map((row) => (
              <Checkbox
                key={row.id}
                label={`${row.displayName} — ${row.email}`}
                checked={draft.ids.includes(row.id)}
                onChange={() => draft.toggle(row.id)}
              />
            ))}
          <BulkPeopleFields draft={draft} />
          {draft.form.errors.ids ? (
            <Callout tone="alert" role="alert">
              {draft.form.errors.ids}
            </Callout>
          ) : null}
          {draft.review ? (
            <Callout tone="warn">
              <p>
                Apply {draft.review.action} to {draft.selected.length} people:{' '}
                {draft.selected.map((row) => row.displayName).join(', ')}?
              </p>
              <Button variant="danger" onClick={draft.commit}>
                Apply reviewed action
              </Button>
              <Button variant="quiet" onClick={() => draft.setReview(null)}>
                Cancel
              </Button>
            </Callout>
          ) : (
            <Button variant="secondary" onClick={draft.preview} disabled={!draft.selected.length}>
              Review bulk action
            </Button>
          )}
          {draft.apply.isError ? (
            <Callout tone="alert" role="alert">
              {draft.apply.error.message}
            </Callout>
          ) : null}
          {draft.apply.data ? (
            <Callout tone="info" role="status">
              {draft.apply.data.data.map((result) => (
                <p key={result.id}>
                  {rows.find((row) => row.id === result.id)?.displayName ?? result.id}:{' '}
                  {result.ok ? 'Completed' : result.error}
                </p>
              ))}
            </Callout>
          ) : null}
        </Stack>
      </fieldset>
    </details>
  );
}
