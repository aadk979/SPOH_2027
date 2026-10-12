'use client';
import { Fragment, type ReactNode } from 'react';
import { ErrorState, LoadingRows } from '@/shared/ui';
import { useWorkspaceOwner } from '../queries';

/** Permission failures remove the private observer, so it cannot recreate a cleared cache key. */
export function WorkspaceReadBoundary({ operation, children }: { operation: string; children: ReactNode }) {
  const context = useWorkspaceOwner();
  if (context.permissions.error) return <ErrorState error={context.permissions.error} operation={operation} />;
  if (!context.enabled) return <LoadingRows label="Checking current workspace access" />;
  return <Fragment key={`${context.eventId}:${context.personId}`}>{children}</Fragment>;
}
