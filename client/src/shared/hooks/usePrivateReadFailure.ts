import { useEffect } from 'react';
import { ApiError } from '@/shared/lib/apiErrors';

/** Unmount a private reader after its server authority is lost. */
export function usePrivateReadFailure(error: Error | null, onDenied: () => void) {
  useEffect(() => {
    if (error instanceof ApiError && [401, 403].includes(error.status)) onDenied();
  }, [error, onDenied]);
}
