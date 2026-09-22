'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  AuditFacets,
  AuditLogPage,
  AuditLogRecord,
  AuditOutcome,
  AuditSeverity,
  AuditSinkStatus,
} from '@spoh/shared';
import { api, ApiError } from '@/lib/api';
import { useCurrentSession } from '../session/useSession';

/**
 * Reading the audit trail.
 *
 * Two modes, and the distinction is the whole design:
 *
 *  - **History** pages backwards from now, 50 rows at a time, on an explicit
 *    "load more". It never refetches on its own — a list that reshuffles while
 *    somebody is reading row 40 is worse than a stale one.
 *  - **Live** tails forwards from the newest row the client already holds. Each
 *    poll asks only for what it is missing, so the request is small no matter
 *    how long the tab has been open, and the answer is appended rather than
 *    merged.
 *
 * The two never run at once. Turning Live on stops the history query from
 * refetching underneath it, and turning it off leaves the accumulated rows in
 * place so the reader does not lose their position.
 */

export interface AuditFilters {
  q: string;
  action: string;
  actionPrefix: string;
  severity: AuditSeverity | '';
  outcome: AuditOutcome | '';
  entityType: string;
  actorId: string;
  from: string;
  to: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  q: '',
  action: '',
  actionPrefix: '',
  severity: '',
  outcome: '',
  entityType: '',
  actorId: '',
  from: '',
  to: '',
};

/** One preset per question an admin actually arrives with. */
export const AUDIT_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  hint: string;
  filters: Partial<AuditFilters>;
}> = [
  { id: 'all', label: 'Everything', hint: 'Every recorded action.', filters: {} },
  {
    id: 'refused',
    label: 'Refused',
    hint: 'Sign-ins, permissions and limits that said no.',
    filters: { outcome: 'DENIED' },
  },
  {
    id: 'security',
    label: 'Security',
    hint: 'Authentication, sessions and permission checks.',
    filters: { actionPrefix: 'auth.,rbac.,session.,rateLimit.' },
  },
  {
    id: 'corrections',
    label: 'Corrections',
    hint: 'Voids, adjustments and reissues.',
    filters: { actionPrefix: 'registration.void,footfall.void,card.void,card.reissue,gift.adjust' },
  },
  {
    id: 'access',
    label: 'Access changes',
    hint: 'Who was added, edited, withdrawn or restored.',
    filters: { actionPrefix: 'user.,roster.,assignment.' },
  },
  {
    id: 'serious',
    label: 'Needs a look',
    hint: 'Warnings and above only.',
    filters: { severity: 'WARNING' },
  },
];

const PAGE_SIZE = 50;
/** Tail interval. Matches the dashboard's own poll so the two feel alike. */
const LIVE_INTERVAL_MS = 5_000;

function toQuery(filters: AuditFilters, extra: Record<string, string>): string {
  const params = new URLSearchParams();

  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.action) params.set('action', filters.action);
  if (filters.actionPrefix) params.set('actionPrefix', filters.actionPrefix);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.outcome) params.set('outcome', filters.outcome);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.from) params.set('from', new Date(filters.from).toISOString());
  if (filters.to) params.set('to', new Date(filters.to).toISOString());

  params.set('limit', String(PAGE_SIZE));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);

  return params.toString();
}

export interface AuditLogView {
  rows: AuditLogRecord[];
  /** First page is loading, or filters changed and we are starting over. */
  loading: boolean;
  /** A "load more" is in flight. */
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  /** Rows appended by the tail since Live was switched on. */
  liveCount: number;
}

/**
 * The log, as the screen consumes it.
 *
 * Rows accumulate in a ref-backed list rather than in query cache pages,
 * because the two modes append at opposite ends and react-query's infinite
 * query has one direction. The list is rebuilt from scratch whenever the
 * filters change, which is the only time a reader expects to lose their place.
 */
export function useAuditLog(filters: AuditFilters, live: boolean): AuditLogView {
  const session = useCurrentSession();

  const [rows, setRows] = useState<AuditLogRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  /** Newest id held, which is what the tail sends as `sinceId`. */
  const latestId = useRef<string | null>(null);
  /** Guards against two loads racing after a fast double-click. */
  const inFlight = useRef(false);
  const filterKey = JSON.stringify(filters);

  // ── First page, and every filter change ──────────────────────────────────
  useEffect(() => {
    if (!session) return;

    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);
    setLiveCount(0);

    api<AuditLogPage>(`/audit?${toQuery(filters, {})}`, { signal: controller.signal })
      .then((page) => {
        if (cancelled) return;
        setRows(page.data);
        setCursor(page.meta.nextCursor);
        setHasMore(page.meta.hasMore);
        latestId.current = page.meta.latestId;
      })
      .catch((cause: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(cause instanceof ApiError ? cause.message : 'Could not load the audit log.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Keyed on filterKey, not `filters`: the object is rebuilt every render,
    // so depending on it directly would restart the query on every keystroke's
    // re-render rather than on an actual filter change.
  }, [session, filterKey]);

  // ── Tail ─────────────────────────────────────────────────────────────────
  //
  // A plain interval rather than a react-query refetch: the response has to be
  // appended to state the query does not own, and `sinceId` changes on every
  // success, which would make the query key churn on every tick.
  useEffect(() => {
    if (!live || !session || loading) return;

    let cancelled = false;
    const controller = new AbortController();

    const tick = async (): Promise<void> => {
      const since = latestId.current;
      if (!since || inFlight.current) return;

      inFlight.current = true;
      try {
        const page = await api<AuditLogPage>(`/audit?${toQuery(filters, { sinceId: since })}`, {
          signal: controller.signal,
        });
        if (cancelled || page.data.length === 0) return;

        // Newest first, to match the history list the rows are joining.
        setRows((current) => [...page.data.slice().reverse(), ...current]);
        setLiveCount((count) => count + page.data.length);
        latestId.current = page.meta.latestId ?? since;
      } catch (cause: unknown) {
        if (!cancelled && !controller.signal.aborted) {
          setError(cause instanceof ApiError ? cause.message : 'Live updates interrupted.');
        }
      } finally {
        inFlight.current = false;
      }
    };

    const timer = setInterval(() => void tick(), LIVE_INTERVAL_MS);
    void tick();

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
    // `filters` is read through the closure; filterKey is what decides when
    // this interval needs rebuilding.
  }, [live, session, loading, filterKey]);

  const loadMore = useCallback(() => {
    if (!cursor || inFlight.current) return;

    inFlight.current = true;
    setLoadingMore(true);

    api<AuditLogPage>(`/audit?${toQuery(filters, { cursor })}`)
      .then((page) => {
        setRows((current) => [...current, ...page.data]);
        setCursor(page.meta.nextCursor);
        setHasMore(page.meta.hasMore);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof ApiError ? cause.message : 'Could not load more.'),
      )
      .finally(() => {
        inFlight.current = false;
        setLoadingMore(false);
      });
    // As above: the cursor and the filter identity are the real inputs.
  }, [cursor, filterKey]);

  return { rows, loading, loadingMore, error, hasMore, loadMore, liveCount };
}

/** Filter options. Static per deployment, so it is fetched once and kept. */
export function useAuditFacets(): UseQueryResult<AuditFacets> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: ['audit', 'facets'],
    queryFn: () => api<AuditFacets>('/audit/facets'),
    enabled: session !== null,
    staleTime: Infinity,
  });
}

/**
 * Where the trail is being shipped.
 *
 * Polled slowly, because the interesting transition — delivery starts failing
 * — is one an admin should see without reloading, and the call is a read of
 * two counters in memory.
 */
export function useAuditSink(): UseQueryResult<AuditSinkStatus> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: ['audit', 'sink'],
    queryFn: () => api<AuditSinkStatus>('/audit/sink'),
    enabled: session !== null,
    refetchInterval: 30_000,
  });
}
