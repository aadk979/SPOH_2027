'use client';
import type { ReactNode } from 'react';
import { useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Callout, LoadingRows, Stack } from '@/shared/ui';
import { GuardrailsPanel, RolePermissionsPanel } from '../components/RolePermissionsPanel';
import { PermissionSimulator } from '../components/PermissionSimulator';
import { useRolePermissions } from '../queries';
import { PermissionReviewPanel } from '../components/PermissionReviewPanel';

/** The event's role permissions, the rules that always hold, and the simulator (P11.7). */
export default function PermissionsScreen(): ReactNode {
  const session = useRequireSession();
  const permissions = useRolePermissions(session !== null);
  const table = permissions.data?.data;
  return (
    <AppShell title="Role permissions" back={{ href: '/chief', label: 'Ops' }} width="reading">
      {permissions.isError ? (
        <Callout tone="alert" role="alert">
          {permissions.error instanceof Error
            ? permissions.error.message
            : 'Role permissions could not be loaded.'}
        </Callout>
      ) : !table ? (
        <LoadingRows label="Loading role permissions" />
      ) : (
        <Stack>
          <RolePermissionsPanel table={table} />
          <PermissionReviewPanel key={table.review?.version} table={table} />
          <PermissionSimulator table={table} />
          <GuardrailsPanel table={table} />
        </Stack>
      )}
    </AppShell>
  );
}
