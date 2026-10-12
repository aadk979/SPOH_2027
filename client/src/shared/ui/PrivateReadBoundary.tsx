'use client';
import { useCallback, useState, type ReactNode } from 'react';
import { PermissionDenied } from './ErrorState';

/** Key this boundary by event and person. Losing server authority unmounts its query reader. */
export function PrivateReadBoundary({ children, silent = false }: { children(onDenied: () => void): ReactNode; silent?: boolean }): ReactNode {
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  return denied ? silent ? null : <PermissionDenied>This read is no longer permitted. Reload your session to check current access.</PermissionDenied> : children(onDenied);
}
