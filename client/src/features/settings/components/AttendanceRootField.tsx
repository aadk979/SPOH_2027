import { useState, type ReactNode } from 'react';
import type { AttendanceConfig } from '@spoh/shared';
import { Button, Callout, Field, Select } from '@/shared/ui';
import { useChangeAttendanceConfig } from '../queries';
import { SettingSaveError } from './SettingSaveError';

/** Select the one active event admin permitted to issue verifier credentials. */
export function AttendanceRootField({
  config,
  canEdit,
}: {
  config: AttendanceConfig;
  canEdit: boolean;
}): ReactNode {
  const [draft, setDraft] = useState(config.rootMembershipId ?? '');
  const save = useChangeAttendanceConfig();
  const changed = draft !== (config.rootMembershipId ?? '');
  return (
    <div className="flex flex-col gap-sm">
      <Field
        id="attendance-root"
        label="Attendance root"
        hint="An active admin of this event who may issue and rotate attendance verifier credentials."
      >
        {(props) => (
          <Select
            {...props}
            value={draft}
            disabled={!canEdit || save.isPending}
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="">No root selected</option>
            {config.rootIsStale && config.rootMembershipId ? (
              <option value={config.rootMembershipId}>Previously selected admin (inactive)</option>
            ) : null}
            {config.eligibleRoots.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName} ({member.email})
              </option>
            ))}
          </Select>
        )}
      </Field>
      {config.rootIsStale ? (
        <Callout tone="alert" title="Choose a new root">
          The selected admin is no longer active in this event. Attendance credential issuance is
          paused until you choose an active admin.
        </Callout>
      ) : null}
      {canEdit && changed ? (
        <div>
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                key: 'attendance.rootMembershipId',
                value: draft || null,
                expectedVersion: config.versions.rootMembershipId,
              })
            }
          >
            Save attendance root
          </Button>
        </div>
      ) : null}
      {save.isError ? <SettingSaveError error={save.error} /> : null}
    </div>
  );
}
