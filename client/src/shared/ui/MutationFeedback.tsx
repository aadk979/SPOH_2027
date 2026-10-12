import type { ReactNode } from 'react';
import { Callout } from './Callout';
import { ErrorState } from './ErrorState';

export function MutationFeedback({ error, pending = false, saved = false, operation = 'Saving', success = 'Saved.', onRetry }: {
  error?: unknown;
  pending?: boolean;
  saved?: boolean;
  operation?: string;
  success?: ReactNode;
  onRetry?: () => void;
}): ReactNode {
  if (error) return <ErrorState error={error} operation={operation} onRetry={onRetry} />;
  if (pending) return <Callout role="status">{operation}…</Callout>;
  return saved ? <Callout tone="ok" role="status">{success}</Callout> : null;
}
