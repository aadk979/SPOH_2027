'use client';

import type { ReactNode } from 'react';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { Button } from './Button';
import { Callout } from './Callout';

export function errorPresentation(error: unknown, operation: string) {
  if (error instanceof ApiError) {
    const denied = error.status === 401 || error.status === 403;
    const missing = error.status === 404;
    return {
      title: denied ? 'Access unavailable' : missing ? 'Not found in this event' : `${operation} was not confirmed`,
      message: error.status < 500 ? error.message : 'Try again. If this continues, give the request ID to an organiser.',
      requestId: error.requestId,
      retry: !denied && !missing && error.isRetryable,
    };
  }
  return {
    title: `${operation} was not confirmed`,
    message: error instanceof NetworkError
      ? 'Check your connection, then retry the same action.'
      : 'Try again. If this continues, contact an organiser.',
    requestId: null,
    retry: true,
  };
}

export function ErrorState({ error, operation = 'This action', onRetry, back, children }: {
  error: unknown;
  operation?: string;
  onRetry?: () => void;
  back?: ReactNode;
  children?: ReactNode;
}): ReactNode {
  const state = errorPresentation(error, operation);
  return (
    <Callout tone="alert" role="alert" title={state.title}>
      <p>{state.message}</p>
      {state.retry && children ? <div className="mt-xs">{children}</div> : null}
      {state.requestId ? <p className="mt-xs text-caption">Request ID: <span className="font-mono">{state.requestId}</span></p> : null}
      {state.retry && onRetry ? <Button variant="quiet" className="mt-sm" onClick={onRetry}>Retry {operation.toLowerCase()}</Button> : null}
      {back}
    </Callout>
  );
}

export function PermissionDenied({ children }: { children?: ReactNode }): ReactNode {
  return <Callout role="alert" title="Access unavailable">{children ?? 'Your current permission does not allow this view.'}</Callout>;
}

export function NotFound({ children, action }: { children?: ReactNode; action?: ReactNode }): ReactNode {
  return <Callout title="Not found in this event">{children ?? 'This item is unavailable. Return to the list or search this event.'}{action}</Callout>;
}

export function OfflineState({ queued = false }: { queued?: boolean }): ReactNode {
  return <Callout tone="warn" role="status">{queued
    ? 'Captures saved on this phone will send when a connection is available. They are waiting to sync.'
    : 'You are offline. Live records and administrative changes need a connection.'}</Callout>;
}
