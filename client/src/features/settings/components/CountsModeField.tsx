import { useState, type ReactNode } from 'react';
import type { CountsMode } from '@spoh/shared';
import { useStations } from '@/features/stations';
import { Button, ChoiceGroup, Field, Select } from '@/shared/ui';
import { countsModeOf, draftOf, sameCountsMode, type CountsDraft } from '../model/countsMode';
import { useChangeEventSetting } from '../queries';
import { SettingSaveError } from './SettingSaveError';

const COUNTS = [
  { value: 'registrations', label: 'Registrations at the booth' },
  { value: 'footfall', label: 'Entries counted at one station' },
  { value: 'journeys', label: 'Mission Card journeys' },
] as const;

/** Which count the headline comes from; footfall names its station. */
function HeadlineSourceFields({
  draft,
  disabled,
  onChange,
}: {
  draft: CountsDraft;
  disabled: boolean;
  onChange(next: CountsDraft): void;
}): ReactNode {
  const stations = useStations();
  const counting = (stations.data ?? []).filter((station) => station.type.countsEntry);
  return (
    <>
      <Field id="headline-count" label="Headline from">
        {(props) => (
          <Select
            {...props}
            disabled={disabled}
            value={draft.count}
            onChange={(event) =>
              onChange({ ...draft, count: event.target.value as CountsDraft['count'] })
            }
          >
            {COUNTS.map((count) => (
              <option key={count.value} value={count.value}>
                {count.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {draft.count === 'footfall' ? (
        <Field id="headline-station" label="Counted at">
          {(props) => (
            <Select
              {...props}
              disabled={disabled}
              value={draft.stationId}
              onChange={(event) => onChange({ ...draft, stationId: event.target.value })}
            >
              <option value="">Choose a station</option>
              {counting.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </>
  );
}

/**
 * How the event shows its three counts (ADR-002 §4). A headline is one of
 * them, labelled with its source; adding them together is not on offer.
 */
export function CountsModeField({
  current,
  version,
  canEdit,
}: {
  current: CountsMode;
  version: number;
  canEdit: boolean;
}): ReactNode {
  const [draft, setDraft] = useState(() => draftOf(current));
  const save = useChangeEventSetting();
  const value = countsModeOf(draft);
  const changed = value !== null && !sameCountsMode(value, current);
  const disabled = !canEdit || save.isPending;
  return (
    <div className="flex flex-col gap-sm">
      <ChoiceGroup
        legend="Counts"
        name="counts-mode"
        layout="list"
        value={draft.mode}
        onChange={(mode) => setDraft({ ...draft, mode })}
        options={[
          {
            value: 'separate',
            label: 'Three counts, side by side',
            hint: 'Registrations, footfall and journeys, each with its unit. No total.',
            disabled,
          },
          {
            value: 'headline',
            label: 'One headline figure as well',
            hint: 'One of the three on top, saying where it comes from. Never a sum.',
            disabled,
          },
        ]}
      />
      {draft.mode === 'headline' ? (
        <HeadlineSourceFields draft={draft} disabled={disabled} onChange={setDraft} />
      ) : null}
      {canEdit && changed ? (
        <div>
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ key: 'product.countsMode', value, expectedVersion: version })
            }
          >
            Save counts
          </Button>
        </div>
      ) : null}
      {save.isError ? <SettingSaveError error={save.error} /> : null}
    </div>
  );
}
