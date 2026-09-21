'use client';

import { useState, type ReactNode } from 'react';
import type { ImportResponse } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  Callout,
  Card,
  CardTitle,
  ChoiceGroup,
  Field,
  Input,
  Stack,
  Textarea,
} from '@/components/ui';
import { useRequireSession } from '@/features/session/useSession';
import { ApiError, api } from '@/lib/api';

/**
 * Reconciliation imports (PRODUCT_BRIEF §11.4).
 *
 * Recovery matters as much as capture. A fallback with no import path is a
 * fallback that loses the data it was built to save.
 *
 * Two things this screen insists on:
 *
 *  - Preview first, always. The commit button only appears after a dry run, and
 *    it shows exactly what the dry run said would happen. Bringing an outage
 *    worth of counts into the real dataset is the operation you most want to
 *    see the diff of.
 *
 *  - Every imported row is source-tagged. There is no "just add these as normal
 *    taps" option, because a report that quietly mixes app data and paper
 *    estimates is worse than one that says which hour is approximate.
 */

type Target = 'registrations' | 'footfall';
type Source = 'FALLBACK_SHEET' | 'PAPER';

const TEMPLATES: Record<Target, string> = {
  registrations:
    'category,stationCode,timeBlockStart,count\n' +
    'SEC_4,SIGNUP_BOOTH,2027-01-07T03:30:00.000Z,12\n' +
    'PARENT_GUARDIAN,SIGNUP_BOOTH,2027-01-07T03:30:00.000Z,5',
  footfall:
    'stationCode,quantity,timeBlockStart\n' +
    'DCDF_STATION,42,2027-01-07T03:30:00.000Z\n' +
    'DCS_STATION,31,2027-01-07T03:30:00.000Z',
};

export default function ImportsPage(): ReactNode {
  const session = useRequireSession();

  const [target, setTarget] = useState<Target>('registrations');
  const [source, setSource] = useState<Source>('FALLBACK_SHEET');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(commit: boolean): Promise<void> {
    setPending(true);
    setError(null);

    try {
      const rows = parseCsv(csv, target);

      if (rows.length === 0) {
        setError('No rows parsed. Check the header line matches the template.');
        return;
      }

      const response = await api<ImportResponse>(`/fallback/imports/${target}`, {
        method: 'POST',
        body: {
          source,
          rows,
          commit,
          ...(fileName.trim() ? { fileName: fileName.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });

      if (commit) {
        setResult(response);
        setPreview(null);
      } else {
        setPreview(response);
        setResult(null);
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? `${cause.message} (${cause.code})`
          : cause instanceof Error
            ? cause.message
            : 'The import failed.',
      );
    } finally {
      setPending(false);
    }
  }

  /** Any change to what is being imported invalidates the dry run. */
  function invalidatePreview(): void {
    setPreview(null);
    setResult(null);
  }

  if (!session) return null;

  return (
    <AppShell
      width="reading"
      title="Import fallback data"
      back={{ href: '/chief', label: 'Live operations' }}
    >
      <Stack>
        <p className="text-text-muted">
          Paste the rows from the fallback sheet or the paper tally. Everything imported is tagged
          with where it came from, and every report will say so.
        </p>

        <Card as="section" className="flex flex-col gap-lg">
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

          <Field
            id="csv"
            label="Rows (CSV)"
            hint="Times are ISO-8601 UTC. A 30-minute block start is enough — a tally sheet never had more precision than that, and pretending otherwise would invent it."
            error={error}
          >
            {(props) => (
              <Textarea
                {...props}
                value={csv}
                onChange={(event) => {
                  setCsv(event.target.value);
                  invalidatePreview();
                }}
                rows={8}
                spellCheck={false}
                placeholder={TEMPLATES[target]}
                // Monospace and no ligatures: this is transcribed data being
                // eyeballed against a sheet, and column alignment is how a
                // missing comma gets spotted.
                scale="mono"
              />
            )}
          </Field>

          <Button
            variant="quiet"
            size="sm"
            className="self-start"
            onClick={() => {
              setCsv(TEMPLATES[target]);
              invalidatePreview();
            }}
          >
            Insert the template
          </Button>

          <div className="grid gap-md sm:grid-cols-2">
            <Field id="file-name" label="File name" optional>
              {(props) => (
                <Input
                  {...props}
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                  placeholder="FALLBACK_Registration.csv"
                />
              )}
            </Field>

            <Field id="notes" label="Notes" optional>
              {(props) => (
                <Input
                  {...props}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Transcribed by the Room A IC"
                />
              )}
            </Field>
          </div>

          <Button
            size="lg"
            block
            disabled={csv.trim().length === 0 || pending}
            onClick={() => void run(false)}
          >
            {pending ? 'Working…' : 'Preview — writes nothing'}
          </Button>
        </Card>

        {preview ? (
          <Card tone="info" as="section" aria-live="polite">
            <CardTitle>This is what would happen</CardTitle>

            <dl className="mt-sm grid grid-cols-[1fr_auto] gap-x-md gap-y-xxs">
              <dt>Rows read</dt>
              <dd className="text-right font-semibold tabular-nums">{preview.rowsRead}</dd>

              <dt>Records that would be created</dt>
              <dd className="text-right font-semibold tabular-nums">{preview.recordsCreated}</dd>

              <dt>Already imported, would be skipped</dt>
              <dd className="text-right font-semibold tabular-nums">{preview.recordsSkipped}</dd>
            </dl>

            {preview.issues.length > 0 ? (
              <Callout tone="warn" className="mt-md">
                <p className="font-semibold">
                  {preview.issues.length} row{preview.issues.length === 1 ? '' : 's'} could not be
                  read:
                </p>
                <ul className="mt-xxs flex flex-col gap-xxs text-caption">
                  {preview.issues.slice(0, 10).map((issue) => (
                    <li key={`${issue.rowNumber}:${issue.field}`}>
                      Row {issue.rowNumber} — {issue.field}: {issue.message}
                    </li>
                  ))}
                </ul>
              </Callout>
            ) : null}

            <Button
              size="lg"
              block
              className="mt-md"
              disabled={preview.recordsCreated === 0 || pending}
              onClick={() => void run(true)}
            >
              Import {preview.recordsCreated} record{preview.recordsCreated === 1 ? '' : 's'} as{' '}
              {source === 'PAPER' ? 'paper' : 'fallback sheet'}
            </Button>
          </Card>
        ) : null}

        {result ? (
          <Card tone="ok" as="section" aria-live="polite">
            <CardTitle>Imported</CardTitle>
            <p className="mt-xs">
              {result.recordsCreated} record{result.recordsCreated === 1 ? '' : 's'} created,{' '}
              {result.recordsSkipped} already present.
            </p>
            <p className="mt-xs text-caption text-text-muted">
              Tagged <strong>{result.source}</strong>. Re-running the same rows is safe — nothing
              will be duplicated.
            </p>
          </Card>
        ) : null}
      </Stack>
    </AppShell>
  );
}

/**
 * Minimal CSV parsing.
 *
 * Deliberately not a library: the input is a handful of columns transcribed off
 * a sheet under time pressure, and the failure mode that matters is a
 * mistyped station code, which the server reports row by row. Anything this
 * cannot read is reported rather than guessed at.
 */
function parseCsv(input: string, target: Target): Array<Record<string, unknown>> {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length < 2) return [];

  const headers = (lines[0] ?? '').split(',').map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const row: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      const value = cells[index];
      if (value === undefined || value === '') return;

      row[header] = header === 'count' || header === 'quantity' ? Number(value) : value;
    });

    // A registration row without an explicit count is one person.
    if (target === 'registrations' && row.count === undefined) row.count = 1;

    return row;
  });
}
