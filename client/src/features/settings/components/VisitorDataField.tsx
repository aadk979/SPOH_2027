import { useState, type ReactNode } from 'react';
import type { VisitorDataMode } from '@spoh/shared';
import { Button, ChoiceGroup } from '@/shared/ui';
import { useChangeEventSetting } from '../queries';
import { SettingSaveError } from './SettingSaveError';

/**
 * Whether the event collects anything about visitors (ADR-002 §4). Off by
 * default; switching it on is possible only before the event goes live.
 */
export function VisitorDataField({
  current,
  version,
  canEdit,
}: {
  current: VisitorDataMode;
  version: number;
  canEdit: boolean;
}): ReactNode {
  const [mode, setMode] = useState(current);
  const save = useChangeEventSetting();
  const disabled = !canEdit || save.isPending;
  return (
    <div className="flex flex-col gap-sm">
      <ChoiceGroup
        legend="Visitor personal data"
        name="visitor-data"
        layout="list"
        value={mode}
        onChange={setMode}
        options={[
          {
            value: 'none',
            label: 'None',
            hint: 'Counts only. Nothing about who a visitor is, apart from a lost-person alert.',
            disabled,
          },
          {
            value: 'allowlist',
            label: 'Only the fields this event declares',
            hint: 'Each field has its own retention and readers. Only before the event goes live.',
            disabled,
          },
        ]}
      />
      {canEdit && mode !== current ? (
        <div>
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ key: 'product.visitorDataMode', value: mode, expectedVersion: version })
            }
          >
            Save visitor data
          </Button>
        </div>
      ) : null}
      {save.isError ? <SettingSaveError error={save.error} /> : null}
    </div>
  );
}
