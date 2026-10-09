import { useState, type ReactNode } from 'react';
import type { AttendanceConfig } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { Button, Callout, Field, Textarea } from '@/shared/ui';
import { useChangeAttendanceConfig, useTestAttendanceNetwork } from '../queries';
import { SettingSaveError } from './SettingSaveError';

/** One IPv4 or IPv6 CIDR per line; test the unsaved list before applying it. */
export function TrustedNetworksField({
  config,
  canEdit,
}: {
  config: AttendanceConfig;
  canEdit: boolean;
}): ReactNode {
  const [draft, setDraft] = useState(config.campusCidrs.join('\n'));
  const save = useChangeAttendanceConfig();
  const test = useTestAttendanceNetwork();
  const cidrs = draft
    .split(/\r?\n/)
    .map((cidr) => cidr.trim())
    .filter(Boolean);
  const changed = JSON.stringify(cidrs) !== JSON.stringify(config.campusCidrs);
  return (
    <div className="flex flex-col gap-sm">
      <Field
        id="trusted-networks"
        label="Trusted networks"
        hint="One IPv4 or IPv6 CIDR range per line. QR attendance verification works only from these ranges."
      >
        {(props) => (
          <Textarea
            {...props}
            rows={4}
            value={draft}
            disabled={!canEdit || save.isPending}
            placeholder="192.0.2.0/24"
            onChange={(event) => {
              setDraft(event.target.value);
              test.reset();
            }}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-sm">
        <Button
          variant="secondary"
          disabled={test.isPending}
          onClick={() => test.mutate({ cidrs })}
        >
          Test from my current IP
        </Button>
        {canEdit && changed ? (
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                key: 'attendance.campusCidrs',
                value: cidrs,
                expectedVersion: config.versions.campusCidrs,
              })
            }
          >
            Save trusted networks
          </Button>
        ) : null}
      </div>
      {test.isSuccess ? (
        <Callout tone={test.data.trusted ? 'ok' : 'alert'} title="Network test">
          {test.data.trusted ? 'Your current IP is trusted.' : 'Your current IP is not trusted.'}{' '}
          The server sees {test.data.ip ?? 'no IP address'}.
        </Callout>
      ) : null}
      {test.isError ? (
        <Callout tone="alert" role="alert" title="Could not test network">
          {test.error instanceof ApiError ? test.error.message : 'Try again in a moment.'}
        </Callout>
      ) : null}
      {save.isError ? <SettingSaveError error={save.error} /> : null}
    </div>
  );
}
