import { useEffect } from 'react';
import { ApiError } from '@/shared/lib/apiErrors';

export function usePrintAccessFailure(error: Error | null, onAccessLost: () => void) {
  useEffect(() => {
    if (error instanceof ApiError && [401, 403].includes(error.status)) onAccessLost();
  }, [error, onAccessLost]);
}
