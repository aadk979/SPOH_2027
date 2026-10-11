import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/shared/lib/apiErrors';
import { Callout } from '@/shared/ui';

/** Unmount every private query and editor together when its read authority is lost. */
export function StructureReadBoundary({
  readable,
  children,
}: {
  readable: boolean;
  children(onAccessLost: () => void): ReactNode;
}) {
  const [denied, setDenied] = useState(false);
  const onAccessLost = useCallback(() => setDenied(true), []);
  if (!readable || denied)
    return (
      <Callout tone="info">
        {denied
          ? 'Event structure access is unavailable. Reload your session.'
          : 'Your role cannot read event structure.'}
      </Callout>
    );
  return children(onAccessLost);
}

export function useStructureReadFailure(
  errors: readonly (Error | null)[],
  onAccessLost: () => void,
) {
  const denied = errors.some(
    (error) => error instanceof ApiError && [401, 403].includes(error.status),
  );
  useEffect(() => {
    if (denied) onAccessLost();
  }, [denied, onAccessLost]);
  return denied;
}
