import { useState, type ReactNode } from 'react';
import {
  GENERATED_SETTING_METADATA,
  type ChangeOrganisationSettingRequest,
  type OrganisationSettingKey,
  type OrganisationSettingsResponse,
} from '@spoh/shared';
import { Button, Card, Field, Input, LoadingRows, Section } from '@/shared/ui';
import { useChangeOrganisationSetting, useOrganisationSettings } from '../queries';
import { SettingSaveError } from './SettingSaveError';

const KEYS = [
  'dashboardPollSeconds',
  'alertPollSeconds',
  'refreshSessionDays',
  'idempotencyRetentionDays',
] as const satisfies readonly OrganisationSettingKey[];

function boundsOf(key: OrganisationSettingKey) {
  return GENERATED_SETTING_METADATA[key].jsonSchema as { minimum: number; maximum: number };
}

/** A whole number within the registry's bounds, or null while it is not one. */
function wholeWithin(text: string, key: OrganisationSettingKey): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  const { minimum, maximum } = boundsOf(key);
  return value >= minimum && value <= maximum ? value : null;
}

/** One organisation-wide value, saved on its own at the version read. */
function OrganisationSettingField({
  settingKey,
  data,
}: {
  settingKey: OrganisationSettingKey;
  data: OrganisationSettingsResponse;
}): ReactNode {
  const metadata = GENERATED_SETTING_METADATA[settingKey];
  const current = data.settings[settingKey];
  const [text, setText] = useState(String(current));
  const save = useChangeOrganisationSetting();
  const value = wholeWithin(text, settingKey);
  const { minimum, maximum } = boundsOf(settingKey);
  const change = {
    key: settingKey,
    value,
    expectedVersion: data.versions[settingKey],
  } as ChangeOrganisationSettingRequest;
  return (
    <div className="flex flex-col gap-sm">
      <Field
        id={`organisation-${settingKey}`}
        label={metadata.label}
        hint={metadata.description}
        error={value === null ? `A whole number from ${minimum} to ${maximum}.` : undefined}
      >
        {(props) => (
          <div className="flex items-center gap-sm">
            <Input
              {...props}
              type="number"
              inputMode="numeric"
              min={minimum}
              max={maximum}
              disabled={!data.canChange || save.isPending}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="max-w-[140px]"
            />
            <span className="text-caption text-text-muted">{metadata.unit}</span>
          </div>
        )}
      </Field>
      {data.canChange && value !== null && value !== current ? (
        <div>
          <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate(change)}>
            Save {metadata.label.toLowerCase()}
          </Button>
        </div>
      ) : null}
      {save.isError ? <SettingSaveError error={save.error} /> : null}
    </div>
  );
}

/**
 * Settings every event of the organisation runs with (platform scope). Only the
 * organisation's platform admins change them (D-17); event Chiefs and Admins see
 * the values that apply.
 */
export function OrganisationSettingsForm({ enabled }: { enabled: boolean }): ReactNode {
  const settings = useOrganisationSettings(enabled);
  const data = settings.data;
  if (!enabled) return null;
  return (
    <Section
      title="Organisation settings"
      description={
        data?.canChange === false
          ? 'Every event of this organisation uses these. Only a platform admin can change them.'
          : 'Every event of this organisation uses these.'
      }
    >
      <Card className="flex flex-col gap-lg">
        {!data ? (
          <LoadingRows />
        ) : (
          KEYS.map((key) => (
            <OrganisationSettingField
              key={`${key}:${data.versions[key]}`}
              settingKey={key}
              data={data}
            />
          ))
        )}
      </Card>
    </Section>
  );
}
