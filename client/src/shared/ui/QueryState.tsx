import type { ReactNode } from 'react';
import { EmptyState, LoadingRows } from './Feedback';
import { ErrorState, PermissionDenied } from './ErrorState';

/** Disabled authority is explicit; it must not become an endless loading screen. */
export function QueryState<T>({ query, operation, allowed = true, isEmpty, empty, children }: {
  query: { data?: T; error: unknown; isPending: boolean; refetch(): unknown };
  operation: string;
  allowed?: boolean;
  isEmpty(data: T): boolean;
  empty: { title: string; description: string; action?: ReactNode };
  children(data: T): ReactNode;
}): ReactNode {
  if (!allowed) return <PermissionDenied />;
  if (query.error) return <ErrorState error={query.error} operation={operation} onRetry={() => { void query.refetch(); }} />;
  if (query.isPending || query.data === undefined) return <LoadingRows label={operation} />;
  if (isEmpty(query.data)) return <EmptyState title={empty.title} action={empty.action}>{empty.description}</EmptyState>;
  return children(query.data);
}
