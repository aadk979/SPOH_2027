import type { ReactNode } from 'react';
import { useMyPermissions } from '@/features/session';
import { ApiError } from '@/shared/lib/apiErrors';
import { Callout, Card, LoadingRows, Section } from '@/shared/ui';
import { useAttendanceConfig } from '../queries';
import { AttendanceRootField } from './AttendanceRootField';
import { TrustedNetworksField } from './TrustedNetworksField';

/**
 * Event-scoped attendance security controls. Config managers see them; only the
 * organisation's platform admins change them (CHANGES.md C9).
 */
export function AttendanceSettingsForm({ enabled }: { enabled: boolean }): ReactNode {
  const config = useAttendanceConfig(enabled);
  const permissions = useMyPermissions(enabled);
  const canEdit = permissions.data?.settings.security === true;
  if (!enabled) return null;
  return (
    <Section
      title="Attendance setup"
      description={
        permissions.data && !canEdit
          ? 'Who runs attendance verification and which venue networks can verify QR codes. Only a platform admin can change these.'
          : 'Choose who runs attendance verification and which venue networks can verify QR codes.'
      }
    >
      <Card className="flex flex-col gap-lg">
        {config.isPending ? <LoadingRows /> : null}
        {config.isError ? (
          <Callout tone="alert" role="alert" title="Attendance setup unavailable">
            {config.error instanceof ApiError ? config.error.message : 'Try again in a moment.'}
          </Callout>
        ) : null}
        {config.data ? (
          <>
            <AttendanceRootField
              key={`root:${config.data.versions.rootMembershipId}`}
              config={config.data}
              canEdit={canEdit}
            />
            <TrustedNetworksField
              key={`networks:${config.data.versions.campusCidrs}`}
              config={config.data}
              canEdit={canEdit}
            />
          </>
        ) : null}
      </Card>
    </Section>
  );
}
