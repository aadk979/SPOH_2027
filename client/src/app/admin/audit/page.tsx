'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { AuditLogRecord, AuditOutcome, AuditSeverity } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  Callout,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  LoadingRows,
  Section,
  Select,
  Stack,
  StatusText,
  type Tone,
} from '@/components/ui';
import { useMe, useRequireSession, useCan } from '@/features/session/useSession';
import {
  AUDIT_PRESETS,
  EMPTY_AUDIT_FILTERS,
  useAuditFacets,
  useAuditLog,
  useAuditSink,
  type AuditFilters,
} from '@/features/admin/useAuditLog';
import { formatDateTime } from '@/lib/format';

/**
 * The audit log (BUILD_PLAN §7.2, §8.7).
 *
 * One screen answering two questions that are usually asked minutes apart:
 * "what is happening right now" and "what happened at 09:42". Live tails the
 * first; the filters and Load more answer the second.
 *
 * Nothing here loads the whole table. The first view is 50 rows, Load more is
 * 50 more, and Live asks only for what arrived since the last poll — so the
 * screen behaves the same on day three as it did on a seeded database.
 */
export default function AuditLogPage(): ReactNode {
  const session = useRequireSession();
  const me = useMe();
  const canRead = useCan(me.data, 'audit.read');

  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [preset, setPreset] = useState('all');
  const [live, setLive] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const facets = useAuditFacets();
  const sink = useAuditSink();
  const log = useAuditLog(filters, live);

  const applyPreset = (id: string): void => {
    const chosen = AUDIT_PRESETS.find((option) => option.id === id);
    setPreset(id);
    setFilters({ ...EMPTY_AUDIT_FILTERS, ...(chosen?.filters ?? {}) });
  };

  /** Any change to a raw control drops the preset — it no longer describes the view. */
  const patch = (change: Partial<AuditFilters>): void => {
    setPreset('');
    setFilters((current) => ({ ...current, ...change }));
  };

  const counts = useMemo(() => {
    let refused = 0;
    let serious = 0;
    for (const row of log.rows) {
      if (row.outcome !== 'SUCCESS') refused += 1;
      if (row.severity === 'WARNING' || row.severity === 'CRITICAL') serious += 1;
    }
    return { refused, serious };
  }, [log.rows]);

  if (!session) return null;

  if (me.data && !canRead) {
    return (
      <AppShell width="wide" title="Audit log">
        <Callout tone="warn">
          Your role cannot read the audit log. Ask a Chief Coordinator or an Admin.
        </Callout>
      </AppShell>
    );
  }

  const cw = sink.data?.cloudWatch;

  return (
    <AppShell width="wide" title="Audit log" back={{ href: '/admin/users', label: 'Volunteers' }}>
      <Stack>
        {/*
          Delivery state, shown on the page rather than only in the log it is
          failing to deliver. A trail that stopped shipping on Tuesday should
          say so where somebody is looking.
        */}
        {cw && cw.enabled ? (
          <Callout tone={cw.lastError ? 'warn' : 'info'}>
            {cw.lastError ? (
              <>
                CloudWatch delivery is failing — <strong>{cw.lastError}</strong>. Rows are still
                being written to the database. {cw.dropped > 0 ? `${cw.dropped} dropped.` : ''}
              </>
            ) : (
              <>
                Also shipping to CloudWatch <strong>{cw.auditLogGroup}</strong> in {cw.region} ·{' '}
                {cw.delivered} events delivered
                {sink.data?.retentionDays ? ` · kept ${sink.data.retentionDays} days` : ''}.
              </>
            )}
          </Callout>
        ) : null}

        {cw && !cw.enabled ? (
          <Callout tone="warn">
            This log lives only in the database on this server. Set{' '}
            <code>CLOUDWATCH_AUDIT_LOG_GROUP</code> so it survives the box.
          </Callout>
        ) : null}

        <Section title="What to show">
          <div className="flex flex-wrap gap-xs">
            {AUDIT_PRESETS.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={preset === option.id ? 'primary' : 'secondary'}
                onClick={() => applyPreset(option.id)}
                title={option.hint}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="mt-md grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field id="audit-q" label="Search">
              {(props) => (
                <Input
                  {...props}
                  value={filters.q}
                  onChange={(event) => patch({ q: event.target.value })}
                  placeholder="Action, person, request id…"
                />
              )}
            </Field>

            <Field id="audit-action" label="Action">
              {(props) => (
                <Select
                  {...props}
                  value={filters.action}
                  onChange={(event) => patch({ action: event.target.value })}
                >
                  <option value="">Any action</option>
                  {(facets.data?.actions ?? []).map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field id="audit-entity" label="Record type">
              {(props) => (
                <Select
                  {...props}
                  value={filters.entityType}
                  onChange={(event) => patch({ entityType: event.target.value })}
                >
                  <option value="">Any record</option>
                  {(facets.data?.entityTypes ?? []).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field id="audit-severity" label="Severity" hint="At this level and above.">
              {(props) => (
                <Select
                  {...props}
                  value={filters.severity}
                  onChange={(event) =>
                    patch({ severity: event.target.value as AuditSeverity | '' })
                  }
                >
                  <option value="">Any severity</option>
                  <option value="NOTICE">Notice and above</option>
                  <option value="WARNING">Warning and above</option>
                  <option value="CRITICAL">Critical only</option>
                </Select>
              )}
            </Field>

            <Field id="audit-outcome" label="Outcome">
              {(props) => (
                <Select
                  {...props}
                  value={filters.outcome}
                  onChange={(event) => patch({ outcome: event.target.value as AuditOutcome | '' })}
                >
                  <option value="">Any outcome</option>
                  <option value="SUCCESS">Allowed</option>
                  <option value="DENIED">Refused</option>
                  <option value="FAILURE">Failed</option>
                </Select>
              )}
            </Field>

            <Field id="audit-from" label="From" hint="Singapore time.">
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={filters.from}
                  onChange={(event) => patch({ from: event.target.value })}
                />
              )}
            </Field>

            <Field id="audit-to" label="To">
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={filters.to}
                  onChange={(event) => patch({ to: event.target.value })}
                />
              )}
            </Field>
          </div>

          <div className="mt-md flex flex-wrap items-center gap-sm">
            <Button
              variant={live ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setLive((on) => !on)}
              aria-pressed={live}
            >
              {live ? 'Live — stop' : 'Go live'}
            </Button>

            <Button size="sm" variant="secondary" onClick={() => applyPreset('all')}>
              Clear filters
            </Button>

            <p className="text-caption text-text-muted" aria-live="polite">
              {log.rows.length} shown
              {log.hasMore ? '+' : ''}
              {counts.refused > 0 ? ` · ${counts.refused} refused` : ''}
              {counts.serious > 0 ? ` · ${counts.serious} need a look` : ''}
              {live ? ` · ${log.liveCount} new since going live` : ''}
            </p>
          </div>
        </Section>

        {log.error ? <Callout tone="warn">{log.error}</Callout> : null}

        <Section title="Events">
          {log.loading ? (
            <LoadingRows />
          ) : log.rows.length === 0 ? (
            <EmptyState title="Nothing matches">
              No recorded action fits these filters. Widen the time range or clear them.
            </EmptyState>
          ) : (
            <Stack>
              <ul className="flex flex-col gap-xs">
                {log.rows.map((row) => (
                  <AuditRow
                    key={row.id}
                    row={row}
                    open={expanded === row.id}
                    onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                  />
                ))}
              </ul>

              {log.hasMore ? (
                <Button
                  variant="secondary"
                  onClick={log.loadMore}
                  disabled={log.loadingMore}
                  aria-label="Load the next 50 events"
                >
                  {log.loadingMore ? 'Loading…' : 'Load 50 more'}
                </Button>
              ) : (
                <p className="text-caption text-text-muted">
                  That is the end of the matching events.
                </p>
              )}
            </Stack>
          )}
        </Section>
      </Stack>
    </AppShell>
  );
}

const SEVERITY_TONE: Record<AuditSeverity, Tone> = {
  INFO: 'info',
  NOTICE: 'info',
  WARNING: 'warn',
  CRITICAL: 'alert',
};

/**
 * One row, collapsed to a line and expandable to its payload.
 *
 * Collapsed by default because `before`/`after` are the reason this table is
 * large, and rendering fifty of them turns a scan into a scroll.
 */
function AuditRow({
  row,
  open,
  onToggle,
}: {
  row: AuditLogRecord;
  open: boolean;
  onToggle: () => void;
}): ReactNode {
  const serious = row.severity === 'WARNING' || row.severity === 'CRITICAL';

  return (
    <li>
      <Card tone={serious ? 'warn' : 'neutral'} as="article">
        <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left">
          <div className="flex flex-wrap items-baseline justify-between gap-xs">
            <CardTitle as="h3">
              <span className="font-mono">{row.action}</span>
            </CardTitle>
            <StatusText tone={SEVERITY_TONE[row.severity]}>
              {row.outcome === 'SUCCESS' ? row.severity.toLowerCase() : row.outcome.toLowerCase()}
            </StatusText>
          </div>

          <p className="text-caption text-text-muted">
            {formatDateTime(row.createdAt)} · {row.actorName}
            {row.entityId ? ` · ${row.entityType} ${row.entityId}` : ` · ${row.entityType}`}
            {row.statusCode ? ` · ${row.method} ${row.path} → ${row.statusCode}` : ''}
          </p>
        </button>

        {open ? (
          <dl className="mt-sm flex flex-col gap-xs text-caption">
            <Detail label="Request id" value={row.requestId} mono />
            <Detail label="Actor subject" value={row.actorSub} mono />
            <Detail label="IP" value={row.ip} mono />
            <Detail label="Device" value={row.userAgent} />
            {row.before !== null ? <Payload label="Before" value={row.before} /> : null}
            {row.after !== null ? <Payload label="After" value={row.after} /> : null}
          </dl>
        ) : null}
      </Card>
    </li>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}): ReactNode {
  if (!value) return null;

  return (
    <div className="flex flex-wrap gap-xs">
      <dt className="text-text-muted">{label}</dt>
      <dd className={mono ? 'font-mono break-all' : 'break-words'}>{value}</dd>
    </div>
  );
}

function Payload({ label, value }: { label: string; value: unknown }): ReactNode {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd>
        <pre className="mt-2xs overflow-x-auto rounded-sm bg-surface-sunken p-xs font-mono text-caption">
          {JSON.stringify(value, null, 2)}
        </pre>
      </dd>
    </div>
  );
}
