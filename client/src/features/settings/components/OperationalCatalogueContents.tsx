import { useEffect, useState } from 'react';
import {
  GENERATED_SETTING_METADATA as metadata,
  type ScopedOperationalSetting,
  type ScopedOperationalSettingKey,
  type ScopedSettingsReadResponse,
  type ScopedSettingsTarget,
  type ScopedSettingsHistoryRecord,
} from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Callout, Card, LoadingRows, Section } from '@/shared/ui';
import { useScopedCatalogue } from '../hooks/useScopedCatalogue';
import { catalogueGroups, catalogueValue } from '../model/operationalCatalogue';
import { captureSource } from '../model/captureControl';
import { OperationalCatalogueHistory } from './OperationalCatalogueHistory';
import { CatalogueRestoreReview } from './CatalogueRestoreReview';
import { CatalogueEditReview } from './CatalogueEditReview';
import { catalogueField, type CatalogueEditAction } from '../model/catalogueEdit';

export function OperationalCatalogueContents(input: {
  target: ScopedSettingsTarget;
  locked: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const { current, denied, deny } = useScopedCatalogue(input.target);
  useEffect(() => {
    if (denied) input.onLockChange(false);
  }, [denied, input.onLockChange]);
  async function loadCurrent() {
    const result = await current.refetch();
    return result.isError ? null : (result.data ?? null);
  }
  if (denied)
    return (
      <Callout tone="alert" role="alert">
        Settings catalogue access is unavailable. Reload your session.
      </Callout>
    );
  const reload = (
    <Button
      variant="quiet"
      disabled={current.isFetching || input.locked}
      onClick={() => {
        void current.refetch();
      }}
    >
      Reload catalogue
    </Button>
  );
  if (current.isError && !current.data)
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
      <OperationalCatalogueValues
        current={current.data}
        onDenied={deny}
        loadCurrent={loadCurrent}
        readUnavailable={current.isError}
        onLockChange={input.onLockChange}
      />
    </div>
  );
}

function OperationalCatalogueValues(input: {
  current: ScopedSettingsReadResponse;
  onDenied: () => void;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  readUnavailable: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const [selected, setSelected] = useState<ScopedOperationalSettingKey | null>(null);
  const [restore, setRestore] = useState<ScopedSettingsHistoryRecord | null>(null);
  const [edit, setEdit] = useState<CatalogueEditAction | null>(null);
  const clock = useEventTime();
  if (restore)
    return <CatalogueRestoreReview {...input} history={restore} onClose={() => setRestore(null)} />;
  if (edit) return <CatalogueEditReview {...input} action={edit} onClose={() => setEdit(null)} />;
  if (input.readUnavailable)
    return (
      <Callout tone="alert" role="alert">
        Current catalogue values are unavailable.
      </Callout>
    );
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
            current={input.current}
            onReview={setRestore}
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
                  archived={input.current.eventStatus === 'ARCHIVED'}
                  onEdit={(operation) => setEdit({ key: row.key, operation })}
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
  archived: boolean;
  onEdit: (operation: CatalogueEditAction['operation']) => void;
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
        {catalogueField(row.key) ? (
          <Button variant="secondary" disabled={input.archived} onClick={() => input.onEdit('set')}>
            Edit catalogue: {metadata[row.key].label}
          </Button>
        ) : null}
        <Button
          variant="quiet"
          disabled={input.archived || row.storedVersion === 0}
          onClick={() => input.onEdit('reset')}
        >
          Remove override: {metadata[row.key].label}
        </Button>
      </Card>
    </li>
  );
}
