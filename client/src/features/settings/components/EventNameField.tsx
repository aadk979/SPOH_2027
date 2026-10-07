import type { ReactNode } from 'react';
import { useMe } from '@/features/session';
import { Button, Callout, Card, Field, Input, LoadingRows, Section } from '@/shared/ui';
import { useEventNameDraft } from '../hooks/useEventNameDraft';
import { useRenameEvent } from '../queries';
import { SettingSaveError } from './SettingSaveError';

/** The event's own name (`Event.name`), renamed by its Chief and Admin. */
export function EventNameField({ canEdit }: { canEdit: boolean }): ReactNode {
  const { data: me } = useMe();
  const draft = useEventNameDraft(me?.event.name);
  const rename = useRenameEvent();
  const { change, read } = draft;
  function onRename(): void {
    if (!canEdit || change === null || read === undefined || rename.isPending) return;
    rename.mutate(
      { name: change, expectedName: read },
      { onSuccess: (response) => draft.accept(response.event.name) },
    );
  }
  return (
    <Section
      title="Event identity"
      description="The event's name, as every screen, report, export and the ops-room display shows it."
    >
      <Card variant="flat" className="flex flex-col gap-sm">
        {read === undefined ? (
          <LoadingRows />
        ) : (
          <>
            <Field
              id="event-name"
              label="Event name"
              error={draft.invalid ? 'Use 2 to 120 characters.' : undefined}
            >
              {(props) => (
                <Input
                  {...props}
                  disabled={!canEdit || rename.isPending}
                  value={draft.text}
                  onChange={(event) => {
                    rename.reset();
                    draft.setText(event.target.value);
                  }}
                  maxLength={120}
                  placeholder="Event name"
                />
              )}
            </Field>
            {canEdit && change !== null ? (
              <div>
                <Button variant="secondary" disabled={rename.isPending} onClick={onRename}>
                  {rename.isPending ? 'Renaming…' : 'Rename event'}
                </Button>
              </div>
            ) : null}
            {rename.isError ? <SettingSaveError error={rename.error} /> : null}
            {rename.isSuccess ? (
              <Callout tone="ok" role="status">
                Renamed. Every screen shows the new name.
              </Callout>
            ) : null}
          </>
        )}
      </Card>
    </Section>
  );
}
