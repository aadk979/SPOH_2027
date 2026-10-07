import { useState, type ReactNode } from 'react';
import { GENERATED_SETTING_METADATA } from '@spoh/shared';
import { Button, Callout, Field, Input } from '@/shared/ui';
import { useChangeEventSetting } from '../queries';
import { SettingSaveError } from './SettingSaveError';

const metadata = GENERATED_SETTING_METADATA.lostPersonPurgeHours;
const bounds = metadata.jsonSchema as { minimum: number; maximum: number };

/** A whole number of hours within the registry's bounds, or null while it is not one. */
function hoursOf(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const hours = Number(text);
  return hours >= bounds.minimum && hours <= bounds.maximum ? hours : null;
}

/**
 * How long a resolved lost-person alert keeps its description (ADR-003 §8). An
 * event may only shorten the 24 hours promised to families (D-16). Shortening
 * removes older descriptions at the next purge, so it is confirmed first.
 */
export function LostPersonRetentionField({
  current,
  version,
  canEdit,
}: {
  current: number;
  version: number;
  canEdit: boolean;
}): ReactNode {
  const [text, setText] = useState(String(current));
  const [confirming, setConfirming] = useState(false);
  const save = useChangeEventSetting();
  const hours = hoursOf(text);
  const changed = hours !== null && hours !== current;
  const disabled = !canEdit || save.isPending;
  const submit = (value: number) =>
    save.mutate({ key: 'lostPersonPurgeHours', value, expectedVersion: version });
  return (
    <div className="flex flex-col gap-sm">
      <Field
        id="lost-person-retention"
        label={metadata.label}
        hint={metadata.description}
        error={
          hours === null
            ? `A whole number of hours from ${bounds.minimum} to ${bounds.maximum}.`
            : undefined
        }
      >
        {(props) => (
          <div className="flex items-center gap-sm">
            <Input
              {...props}
              type="number"
              inputMode="numeric"
              min={bounds.minimum}
              max={bounds.maximum}
              disabled={disabled}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setConfirming(false);
              }}
              className="max-w-[140px]"
            />
            <span className="text-caption text-text-muted">{metadata.unit}</span>
          </div>
        )}
      </Field>
      {canEdit && changed ? (
        <RetentionSave
          hours={hours}
          current={current}
          confirming={confirming}
          pending={save.isPending}
          onConfirm={setConfirming}
          onSave={() => submit(hours)}
        />
      ) : null}
      {save.isError ? <SettingSaveError error={save.error} /> : null}
    </div>
  );
}

/** Lengthening saves at once; shortening removes older descriptions, so it asks first. */
function RetentionSave(input: {
  hours: number;
  current: number;
  confirming: boolean;
  pending: boolean;
  onConfirm(confirming: boolean): void;
  onSave(): void;
}): ReactNode {
  const { hours, current, pending } = input;
  if (!input.confirming)
    return (
      <div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => (hours < current ? input.onConfirm(true) : input.onSave())}
        >
          Save retention
        </Button>
      </div>
    );
  return (
    <Callout tone="warn" title="Remove descriptions sooner?">
      <p>
        Descriptions of alerts resolved more than {hours} hours ago are removed at the next purge.
        They cannot be recovered.
      </p>
      <div className="mt-sm flex flex-wrap gap-sm">
        <Button variant="warn" disabled={pending} onClick={input.onSave}>
          Confirm {hours} hours
        </Button>
        <Button variant="quiet" disabled={pending} onClick={() => input.onConfirm(false)}>
          Keep {current} hours
        </Button>
      </div>
    </Callout>
  );
}
