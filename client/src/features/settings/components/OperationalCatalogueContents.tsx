import { useState } from 'react';
import {
  GENERATED_SETTING_METADATA as metadata,
  type ScopedOperationalSetting,
  type ScopedOperationalSettingKey,
  type ScopedSettingsReadResponse,
  type ScopedSettingsTarget,
} from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Callout, Card, LoadingRows, Section } from '@/shared/ui';
import { useScopedCatalogue } from '../hooks/useScopedCatalogue';
import { catalogueGroups, catalogueValue } from '../model/operationalCatalogue';
import { captureSource } from '../model/captureControl';
import { OperationalCatalogueHistory } from './OperationalCatalogueHistory';

export function OperationalCatalogueContents({ target }: { target: ScopedSettingsTarget }) {
  const { current, denied, deny } = useScopedCatalogue(target);
  if (denied)
    return (
      <Callout tone="alert" role="alert">
        Settings catalogue access is unavailable. Reload your session.
      </Callout>
    );
  const reload = (
    <Button
      variant="quiet"
      disabled={current.isFetching}
      onClick={() => {
        void current.refetch();
      }}
    >
      Reload catalogue
    </Button>
  );
  if (current.isError)
    return (
      <div className="flex flex-col gap-md">
        {reload}
        <Callout tone="alert" role="alert">
          Current catalogue values are unavailable.
        </Callout>
      </div>
    );
  if (!current.data) return <LoadingRows />;
  return (
    <div className="flex flex-col gap-md">
      {reload}
      <OperationalCatalogueValues current={current.data} onDenied={deny} />
    </div>
  );
}

function OperationalCatalogueValues(input: {
  current: ScopedSettingsReadResponse;
  onDenied: () => void;
}) {
  const [selected, setSelected] = useState<ScopedOperationalSettingKey | null>(null);
  const clock = useEventTime();
  return (
    <>
      <p className="text-caption text-ink-muted">
        Checked {clock.dateTime(input.current.evaluatedAt)} on the event clock.
      </p>
      {input.current.eventStatus === 'ARCHIVED' ? (
        <Callout>Archived event settings are read only.</Callout>
      ) : null}
      {selected ? (
        <>
          <Button variant="quiet" onClick={() => setSelected(null)}>
            Back to catalogue values
          </Button>
          <OperationalCatalogueHistory
            key={selected}
            target={input.current.target}
            settingKey={selected}
            onDenied={input.onDenied}
          />
        </>
      ) : (
        catalogueGroups(input.current).map(({ title, rows }) => (
          <Section key={title} title={title}>
            <ul aria-label={`${title} catalogue values`} className="flex flex-col gap-sm">
              {rows.map((row) => (
                <CatalogueValueRow
                  key={row.key}
                  row={row}
                  scope={input.current.target.scope}
                  onHistory={() => setSelected(row.key)}
                />
              ))}
            </ul>
          </Section>
        ))
      )}
    </>
  );
}
function CatalogueValueRow(input: {
  row: ScopedOperationalSetting;
  scope: 'event' | 'station';
  onHistory: () => void;
}) {
  const { row } = input;
  return (
    <li>
      <Card className="flex flex-col gap-sm">
        <h3 className="text-section">{metadata[row.key].label}</h3>
        <p>{metadata[row.key].description}</p>
        <p className="break-words">Scoped value: {catalogueValue(row.key, row.value)}</p>
        <p>
          {captureSource(row, input.scope)} · Selected scope version {row.storedVersion} · Source
          version {row.source.version}
        </p>
        {row.invalidScopes.length ? (
          <Callout tone="alert">
            An invalid stored value was skipped at {row.invalidScopes.join(', ')} scope.
          </Callout>
        ) : null}
        <Button variant="secondary" onClick={input.onHistory}>
          View history: {metadata[row.key].label}
        </Button>
      </Card>
    </li>
  );
}
