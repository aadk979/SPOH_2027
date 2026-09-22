'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ROSTER_CSV_TEMPLATE,
  ROSTER_IMPORT_MAX_ROWS,
  parseRosterCsv,
  type ParsedRosterCsv,
  type RosterImportOutcome,
  type RosterImportResponse,
} from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  CardTitle,
  Field,
  Stack,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { useExportRoster, useImportRoster } from '@/features/admin/useVolunteers';

/**
 * Roster import.
 *
 * Three stages, and the file never moves to the next one with a problem the
 * admin has not seen:
 *
 *  1. Read.    The file is parsed here, in the browser, against the same schema
 *              the server validates with. A mistyped email on line 143 is
 *              reported as "line 143" before a single request is made, and it
 *              is left out rather than failing the other 199 lines.
 *
 *  2. Preview. The server runs the whole import inside a transaction it then
 *              rolls back, and reports what would happen to every row — who is
 *              new, who is changed, who it will not touch and why.
 *
 *  3. Commit.  The button says exactly what the preview said, and nothing
 *              else. Two hundred invite emails is the operation you most want
 *              to have read the diff of.
 */

type Stage = 'read' | 'previewed' | 'committed';

export default function RosterImportPage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const importRoster = useImportRoster();
  const exportRoster = useExportRoster();

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('read');
  const [result, setResult] = useState<RosterImportResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text.trim() ? parseRosterCsv(text) : null), [text]);

  if (!session) return null;

  const canProvision = me?.capabilities.includes('user.provision') ?? false;
  const validRows = parsed?.rows ?? [];
  const tooMany = validRows.length > ROSTER_IMPORT_MAX_ROWS;

  /** Any change to the text invalidates whatever the server said about it. */
  function replaceText(next: string, name: string | null): void {
    setText(next);
    setFileName(name);
    setStage('read');
    setResult(null);
    importRoster.reset();
  }

  async function readFile(file: File): Promise<void> {
    replaceText(await file.text(), file.name);
  }

  function run(commit: boolean): void {
    importRoster.mutate(
      { rows: validRows.map((entry) => entry.row), commit },
      {
        onSuccess: (response) => {
          setResult(response);
          setStage(commit ? 'committed' : 'previewed');
        },
      },
    );
  }

  /** Server issues are numbered by the rows it was sent; the admin thinks in file lines. */
  const lineOf = (rowNumber: number): number => validRows[rowNumber - 1]?.line ?? rowNumber;

  return (
    <AppShell
      title="Import the roster"
      back={{ href: '/admin/users', label: 'Volunteers' }}
      width="wide"
    >
      <Stack>
        <p className="text-text-muted">
          One row per shift, so somebody with two shifts is two rows. New people get an invite
          email; people already on the roster are updated. Nothing is written until you have seen
          the preview.
        </p>

        {!canProvision ? (
          <Callout tone="info">
            You can roster people who are already on the list. Anyone new in the file will be
            reported as skipped — a Chief Coordinator or Admin has to add them first.
          </Callout>
        ) : null}

        <Card as="section" className="flex flex-col gap-md">
          <CardTitle>1. The file</CardTitle>

          <div className="flex flex-wrap gap-sm">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              aria-label="Choose a CSV file"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                // So choosing the same file again after editing it re-reads it.
                event.target.value = '';
              }}
            />
            <Button onClick={() => fileInput.current?.click()}>Choose a CSV</Button>
            <Button variant="quiet" onClick={() => replaceText(ROSTER_CSV_TEMPLATE, null)}>
              Insert the template
            </Button>
            <Button
              variant="quiet"
              disabled={exportRoster.isPending}
              onClick={() => exportRoster.mutate()}
            >
              {exportRoster.isPending ? 'Preparing…' : 'Download the current roster'}
            </Button>
          </div>

          <Field
            id="roster-csv"
            label={fileName ? `Rows from ${fileName}` : 'Or paste rows'}
            hint="Straight out of Excel or Sheets is fine — tabs, quotes and 7/1/2027 all read. Columns: name, email, role, phone, portfolio, reports to, station code, date, shift (AM/PM), role on shift. Only name and email are required."
          >
            {(props) => (
              <Textarea
                {...props}
                value={text}
                onChange={(event) => replaceText(event.target.value, null)}
                rows={10}
                spellCheck={false}
                placeholder={ROSTER_CSV_TEMPLATE}
                // Monospace and no ligatures: column alignment is how a
                // missing comma gets spotted.
                scale="mono"
              />
            )}
          </Field>

          {parsed ? <ReadSummary parsed={parsed} /> : null}

          {tooMany ? (
            <Callout tone="alert" role="alert">
              That is {validRows.length} rows; one import takes at most {ROSTER_IMPORT_MAX_ROWS}.
              Split the file by day or by portfolio and run it twice.
            </Callout>
          ) : null}

          <Button
            size="lg"
            block
            disabled={validRows.length === 0 || tooMany || importRoster.isPending}
            onClick={() => run(false)}
          >
            {importRoster.isPending && stage === 'read'
              ? 'Checking…'
              : `Preview ${validRows.length} ${validRows.length === 1 ? 'row' : 'rows'} — writes nothing`}
          </Button>
        </Card>

        {importRoster.error ? (
          <Callout tone="alert" role="alert" title="The server could not run that">
            {importRoster.error instanceof ApiError
              ? `${importRoster.error.message} (${importRoster.error.code})`
              : 'Could not reach the server. Try again in a moment.'}
          </Callout>
        ) : null}

        {result && stage === 'previewed' ? (
          <PreviewCard
            result={result}
            rows={validRows}
            lineOf={lineOf}
            leftOut={parsed?.errors.length ?? 0}
            pending={importRoster.isPending}
            onCommit={() => run(true)}
          />
        ) : null}

        {result && stage === 'committed' ? <ResultCard result={result} lineOf={lineOf} /> : null}
      </Stack>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────
// STAGE 1: WHAT THE BROWSER READ
// ─────────────────────────────────────────────────────────────

function ReadSummary({ parsed }: { parsed: ParsedRosterCsv }): ReactNode {
  if (parsed.missingColumns.length > 0) {
    return (
      <Callout tone="alert" role="alert" title="The header line is missing a column">
        Every row needs at least <strong>name</strong> and <strong>email</strong>; this file has no{' '}
        {parsed.missingColumns.map((column) => columnWord(column)).join(' or ')} column. Check the
        first line matches the template.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-sm" aria-live="polite">
      <p className="text-caption text-text-muted">
        {parsed.totalRows} {parsed.totalRows === 1 ? 'row' : 'rows'} read
        {parsed.errors.length > 0
          ? `, ${parsed.rows.length} ready, ${parsed.errors.length} left out`
          : ', all ready'}
        {parsed.unknownColumns.length > 0
          ? `. Ignored ${parsed.unknownColumns.length === 1 ? 'column' : 'columns'}: ${parsed.unknownColumns.join(', ')}`
          : ''}
        .
      </p>

      {parsed.errors.length > 0 ? (
        <Callout
          tone="warn"
          title={`${parsed.errors.length} ${parsed.errors.length === 1 ? 'line' : 'lines'} will be left out`}
        >
          <p className="text-caption">
            Fix them in the sheet and paste again, or go ahead without them.
          </p>
          <IssueList
            items={parsed.errors.map((error) => ({
              line: error.line,
              field: error.field,
              message: error.message,
            }))}
          />
        </Callout>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STAGE 2: WHAT THE SERVER WOULD DO
// ─────────────────────────────────────────────────────────────

function PreviewCard({
  result,
  rows,
  lineOf,
  leftOut,
  pending,
  onCommit,
}: {
  result: RosterImportResponse;
  rows: ParsedRosterCsv['rows'];
  lineOf(rowNumber: number): number;
  leftOut: number;
  pending: boolean;
  onCommit(): void;
}): ReactNode {
  const writes =
    result.volunteersCreated +
    result.volunteersUpdated +
    result.assignmentsCreated +
    result.assignmentsUpdated;

  return (
    <Card tone="info" as="section" aria-live="polite" className="flex flex-col gap-md">
      <CardTitle>2. This is what would happen</CardTitle>

      <Counts result={result} />

      {result.issues.length > 0 ? (
        <Callout
          tone="warn"
          title={`${result.issues.length} ${result.issues.length === 1 ? 'thing' : 'things'} the import will not do`}
        >
          <p className="text-caption">
            Each is skipped on its own; the rest of the file still goes in.
          </p>
          <IssueList
            items={result.issues.map((issue) => ({
              line: lineOf(issue.rowNumber),
              field: issue.field,
              message: issue.message,
            }))}
          />
        </Callout>
      ) : null}

      <OutcomeTable outcomes={result.outcomes} rows={rows} lineOf={lineOf} />

      {leftOut > 0 ? (
        <p className="text-caption text-text-muted">
          {leftOut} {leftOut === 1 ? 'line' : 'lines'} with problems in the file itself{' '}
          {leftOut === 1 ? 'is' : 'are'} not included above.
        </p>
      ) : null}

      <Button size="lg" block disabled={writes === 0 || pending} onClick={onCommit}>
        {pending
          ? 'Importing…'
          : writes === 0
            ? 'Nothing to import'
            : `Import: ${summariseWrites(result)}`}
      </Button>

      {result.volunteersCreated > 0 ? (
        <p className="text-caption text-text-muted">
          {result.volunteersCreated} invite {result.volunteersCreated === 1 ? 'email' : 'emails'}{' '}
          will be sent. That cannot be undone, which is why you are reading this first.
        </p>
      ) : null}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// STAGE 3: WHAT IT DID
// ─────────────────────────────────────────────────────────────

function ResultCard({
  result,
  lineOf,
}: {
  result: RosterImportResponse;
  lineOf(rowNumber: number): number;
}): ReactNode {
  return (
    <Card tone="ok" as="section" aria-live="polite" className="flex flex-col gap-md">
      <CardTitle>3. Imported</CardTitle>

      <Counts result={result} />

      {result.identitiesCreated > 0 ? (
        <p className="text-body">
          {result.identitiesCreated} invite{' '}
          {result.identitiesCreated === 1 ? 'email is' : 'emails are'} on the way. Anyone who says
          it never arrived: check spam, then use "Resend invite" on their row.
        </p>
      ) : null}

      {result.issues.length > 0 ? (
        <Callout tone="warn" title={`${result.issues.length} skipped, as previewed`}>
          <IssueList
            items={result.issues.map((issue) => ({
              line: lineOf(issue.rowNumber),
              field: issue.field,
              message: issue.message,
            }))}
          />
        </Callout>
      ) : null}

      <p className="text-caption text-text-muted">
        Running the same file again is safe: it updates rather than duplicates.
      </p>

      <ButtonLink href="/admin/users" variant="secondary" className="self-start">
        Back to the roster
      </ButtonLink>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// PIECES
// ─────────────────────────────────────────────────────────────

function Counts({ result }: { result: RosterImportResponse }): ReactNode {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-md gap-y-xxs">
      <dt>New people</dt>
      <dd className="text-right font-semibold tabular-nums">{result.volunteersCreated}</dd>
      <dt>People updated</dt>
      <dd className="text-right font-semibold tabular-nums">{result.volunteersUpdated}</dd>
      {result.volunteersSkipped > 0 ? (
        <>
          <dt>People not touched</dt>
          <dd className="text-right font-semibold tabular-nums">{result.volunteersSkipped}</dd>
        </>
      ) : null}
      <dt>Shifts added</dt>
      <dd className="text-right font-semibold tabular-nums">{result.assignmentsCreated}</dd>
      <dt>Shifts changed</dt>
      <dd className="text-right font-semibold tabular-nums">{result.assignmentsUpdated}</dd>
    </dl>
  );
}

function summariseWrites(result: RosterImportResponse): string {
  const parts: string[] = [];
  if (result.volunteersCreated > 0) {
    parts.push(
      `add ${result.volunteersCreated} ${result.volunteersCreated === 1 ? 'person' : 'people'}`,
    );
  }
  if (result.volunteersUpdated > 0) parts.push(`update ${result.volunteersUpdated}`);
  const shifts = result.assignmentsCreated + result.assignmentsUpdated;
  if (shifts > 0) parts.push(`${shifts} ${shifts === 1 ? 'shift' : 'shifts'}`);
  return parts.join(', ');
}

function IssueList({
  items,
}: {
  items: Array<{ line: number; field: string; message: string }>;
}): ReactNode {
  const shown = items.slice(0, 25);
  return (
    <ul className="mt-xxs flex flex-col gap-xxs text-caption">
      {shown.map((item, index) => (
        <li key={`${item.line}:${item.field}:${index}`}>
          <span className="font-semibold tabular-nums">Line {item.line}</span>
          {item.field !== 'row' ? ` · ${columnWord(item.field)}` : ''} — {item.message}
        </li>
      ))}
      {items.length > shown.length ? <li>…and {items.length - shown.length} more.</li> : null}
    </ul>
  );
}

const OUTCOME_WORDS: Record<RosterImportOutcome['person'], string> = {
  create: 'New',
  update: 'Update',
  skip: 'Skip',
};

const SHIFT_WORDS: Record<RosterImportOutcome['assignment'], string> = {
  create: 'Add',
  update: 'Change',
  skip: 'Skip',
  none: '—',
};

/**
 * Every row, and what happens to it. Capped, because the table is for
 * spot-checking ("is the Chief's own row really skipped?") rather than reading
 * — the counts above are the summary, and the issues list carries every skip.
 */
function OutcomeTable({
  outcomes,
  rows,
  lineOf,
}: {
  outcomes: RosterImportOutcome[];
  rows: ParsedRosterCsv['rows'];
  lineOf(rowNumber: number): number;
}): ReactNode {
  const limit = 100;
  const shown = outcomes.slice(0, limit);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-caption">
        <thead>
          <tr className="text-left text-text-muted">
            <th className="pr-md pb-xs font-semibold">Line</th>
            <th className="pr-md pb-xs font-semibold">Person</th>
            <th className="pr-md pb-xs font-semibold">Account</th>
            <th className="pb-xs font-semibold">Shift</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((outcome) => {
            const row = rows[outcome.rowNumber - 1]?.row;
            const dim = outcome.person === 'skip' && outcome.assignment !== 'create';
            return (
              <tr key={outcome.rowNumber} className={dim ? 'text-text-subtle' : undefined}>
                <td className="pr-md py-xxs tabular-nums">{lineOf(outcome.rowNumber)}</td>
                <td className="pr-md py-xxs">
                  {row?.displayName ?? ''} <span className="text-text-muted">{outcome.email}</span>
                </td>
                <td className="pr-md py-xxs">{OUTCOME_WORDS[outcome.person]}</td>
                <td className="py-xxs">
                  {SHIFT_WORDS[outcome.assignment]}
                  {row?.stationCode && outcome.assignment !== 'none'
                    ? ` · ${row.stationCode} ${row.eventDate ?? ''} ${row.block === 'MORNING' ? 'AM' : row.block === 'AFTERNOON' ? 'PM' : ''}`
                    : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {outcomes.length > limit ? (
        <p className="mt-xs text-caption text-text-muted">
          Showing the first {limit} of {outcomes.length} rows. The counts and the issues above cover
          all of them.
        </p>
      ) : null}
    </div>
  );
}

function columnWord(field: string): string {
  const words: Record<string, string> = {
    displayName: 'name',
    email: 'email',
    role: 'role',
    phone: 'phone',
    portfolio: 'portfolio',
    reportsToEmail: 'reports to',
    stationCode: 'station',
    eventDate: 'date',
    block: 'shift',
    roleLabel: 'role on shift',
    'stationCode/eventDate/block': 'station / date / shift',
  };
  return words[field] ?? field;
}
