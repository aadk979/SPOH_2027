'use client';

import { useState, type ReactNode } from 'react';
import type { ImportResponse } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
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
  const [source, setSource] = useState<'FALLBACK_SHEET' | 'PAPER'>('FALLBACK_SHEET');
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

  if (!session) return null;

  return (
    <AppShell title="Import fallback data" back={{ href: '/chief', label: 'Live operations' }}>
      <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
        Paste the rows from the fallback sheet or the paper tally. Everything imported is tagged
        with where it came from, and every report will say so.
      </p>

      <fieldset className="mb-4">
        <legend className="font-semibold">What are you importing?</legend>
        <div className="mt-2 flex gap-2">
          {(
            [
              { value: 'registrations', label: 'Registrations' },
              { value: 'footfall', label: 'Room entries' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setTarget(option.value);
                setPreview(null);
                setResult(null);
              }}
              aria-pressed={target === option.value}
              className="rounded-full border px-5 py-3"
              style={{
                minHeight: 44,
                borderColor: target === option.value ? 'var(--color-primary)' : 'var(--line)',
                background: target === option.value ? 'var(--color-primary)' : 'var(--surface)',
                color: target === option.value ? 'var(--color-on-primary)' : 'var(--text)',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="font-semibold">Where did it come from?</legend>
        <div className="mt-2 flex gap-2">
          {(
            [
              { value: 'FALLBACK_SHEET', label: 'Google fallback sheet' },
              { value: 'PAPER', label: 'Paper tally' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSource(option.value)}
              aria-pressed={source === option.value}
              className="rounded-full border px-5 py-3"
              style={{
                minHeight: 44,
                borderColor: source === option.value ? 'var(--color-primary)' : 'var(--line)',
                background: source === option.value ? 'var(--surface-alt)' : 'var(--surface)',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor="csv" className="block font-semibold">
        Rows (CSV)
      </label>
      <p className="mb-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        Times are ISO-8601 UTC. A 30-minute block start is enough — a tally sheet never had more
        precision than that, and pretending otherwise would invent it.
      </p>
      <textarea
        id="csv"
        value={csv}
        onChange={(event) => {
          setCsv(event.target.value);
          setPreview(null);
          setResult(null);
        }}
        rows={8}
        spellCheck={false}
        placeholder={TEMPLATES[target]}
        className="w-full rounded-lg border px-4 py-3 font-mono text-sm"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--text)' }}
      />

      <button type="button" className="pill-quiet mt-2" onClick={() => setCsv(TEMPLATES[target])}>
        Insert the template
      </button>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="file-name" className="block font-semibold">
            File name
          </label>
          <input
            id="file-name"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="FALLBACK_Registration.csv"
            className="mt-2 w-full rounded-lg border px-4 py-3"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minHeight: 48,
            }}
          />
        </div>
        <div>
          <label htmlFor="notes" className="block font-semibold">
            Notes
          </label>
          <input
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Transcribed by the Room A IC"
            className="mt-2 w-full rounded-lg border px-4 py-3"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minHeight: 48,
            }}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4" style={{ color: 'var(--color-alert)' }}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="pill mt-5 w-full"
        style={{ minHeight: 56 }}
        disabled={csv.trim().length === 0 || pending}
        onClick={() => void run(false)}
      >
        {pending ? 'Working…' : 'Preview — writes nothing'}
      </button>

      {preview ? (
        <section className="tile mt-5" aria-live="polite">
          <h2 className="mb-2 font-semibold">This is what would happen</h2>
          <ul className="flex flex-col gap-1">
            <li>
              Rows read: <strong>{preview.rowsRead}</strong>
            </li>
            <li>
              Records that would be created: <strong>{preview.recordsCreated}</strong>
            </li>
            <li>
              Already imported, would be skipped: <strong>{preview.recordsSkipped}</strong>
            </li>
          </ul>

          {preview.issues.length > 0 ? (
            <div className="mt-3" style={{ color: 'var(--color-warn)' }}>
              <p className="font-semibold">
                {preview.issues.length} row{preview.issues.length === 1 ? '' : 's'} could not be
                read:
              </p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {preview.issues.slice(0, 10).map((issue) => (
                  <li key={`${issue.rowNumber}:${issue.field}`}>
                    Row {issue.rowNumber} — {issue.field}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            className="mt-4 w-full rounded-lg px-5 py-4 font-semibold"
            style={{ background: 'var(--color-primary)', color: '#ffffff', minHeight: 56 }}
            disabled={preview.recordsCreated === 0 || pending}
            onClick={() => void run(true)}
          >
            Import {preview.recordsCreated} record
            {preview.recordsCreated === 1 ? '' : 's'} as{' '}
            {source === 'PAPER' ? 'paper' : 'fallback sheet'}
          </button>
        </section>
      ) : null}

      {result ? (
        <section
          className="tile mt-5"
          style={{ borderLeft: '4px solid var(--color-ok)' }}
          aria-live="polite"
        >
          <h2 className="mb-2 font-semibold" style={{ color: 'var(--color-ok)' }}>
            Imported
          </h2>
          <p>
            {result.recordsCreated} record{result.recordsCreated === 1 ? '' : 's'} created,{' '}
            {result.recordsSkipped} already present.
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Tagged <strong>{result.source}</strong>. Re-running the same rows is safe — nothing will
            be duplicated.
          </p>
        </section>
      ) : null}
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
