import type { ReactNode } from 'react';
import { ROSTER_CSV_HEADER } from '@spoh/shared';
import { Button, Callout, Field, Textarea, Stack } from '@/shared/ui';
import { useRosterImport } from '../hooks/useRosterImport';

export function RosterImportForm(): ReactNode {
  const draft = useRosterImport();
  const result = draft.importPeople.data;
  return (
    <Stack>
      <p>
        Paste a CSV or tab-separated spreadsheet. Review it before applying. Cognito’s default
        sender allows about 50 invitations per day.
      </p>
      <code className="break-all text-caption">{ROSTER_CSV_HEADER}</code>
      <Field
        id="people-csv"
        label="Roster CSV"
        error={draft.form.errors.csv}
        hint="Use YYYY-MM-DD dates and your event’s exact station and shift codes."
      >
        {(props) => (
          <Textarea
            {...props}
            scale="mono"
            rows={8}
            value={draft.form.values.csv}
            disabled={draft.importPeople.isPending}
            onChange={(event) => draft.change(event.target.value)}
          />
        )}
      </Field>
      {draft.error ? (
        <Callout tone="alert" role="alert">
          <p className="whitespace-pre-wrap">{draft.error}</p>
        </Callout>
      ) : null}
      {draft.importPeople.isError ? (
        <Callout tone="alert" role="alert">
          {draft.importPeople.error.message}
        </Callout>
      ) : null}
      {result ? (
        <Callout tone={result.issues.length ? 'warn' : 'ok'} role="status">
          <p>
            {result.committed ? 'Applied' : 'Preview'}: {result.volunteersCreated} people added,{' '}
            {result.volunteersUpdated} updated, {result.assignmentsCreated} shifts added,{' '}
            {result.assignmentsUpdated} updated.
          </p>
          {result.issues.map((issue, index) => (
            <p key={index}>
              Row {issue.rowNumber}, {issue.field}: {issue.message}
            </p>
          ))}
        </Callout>
      ) : null}
      <div className="flex flex-wrap gap-sm">
        <Button
          variant="secondary"
          disabled={draft.importPeople.isPending || !draft.form.values.csv.trim()}
          onClick={draft.preview}
        >
          Preview import
        </Button>
        {draft.review ? (
          <Button disabled={draft.importPeople.isPending} onClick={draft.apply}>
            {draft.importPeople.isPending ? 'Applying…' : 'Apply reviewed import'}
          </Button>
        ) : null}
      </div>
    </Stack>
  );
}
