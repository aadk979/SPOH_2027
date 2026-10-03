import type { AnnouncementDraftRecord, MeResponse } from '@spoh/shared';
import { Button, Callout, Card, ChoiceGroup, Field, Input, Textarea } from '@/shared/ui';
import { useDraftEditor } from '../hooks/useDraftEditor';
import { PRIORITY_LABELS } from '../model/priority';
import { DraftAudience } from './DraftAudience';

export function DraftEditor({
  draft,
  me,
  onSaved,
}: {
  draft?: AnnouncementDraftRecord | undefined;
  me: MeResponse;
  onSaved: (draft: AnnouncementDraftRecord) => void;
}) {
  const form = useDraftEditor({ draft, me, onSaved });
  const readonly = me.event.status === 'ARCHIVED' || !!draft?.publishedAt;
  return (
    <Card as="section" className="flex flex-col gap-md">
      <h3 className="text-tagline">
        {draft ? `Saved draft · version ${draft.version}` : 'New private draft'}
      </h3>
      <p className="text-caption text-text-muted">
        Only you can read this draft. Saving it does not publish a message.
      </p>
      {readonly ? (
        <Callout>
          Published or archived drafts are read-only. Create a new draft for another message.
        </Callout>
      ) : null}
      {form.error ? (
        <Callout tone="alert" role="alert">
          {form.error}
        </Callout>
      ) : null}
      <DraftEditorFields form={form} draft={draft} me={me} readonly={readonly} />
    </Card>
  );
}

function DraftEditorFields({
  form,
  draft,
  me,
  readonly,
}: {
  form: ReturnType<typeof useDraftEditor>;
  draft: AnnouncementDraftRecord | undefined;
  me: MeResponse;
  readonly: boolean;
}) {
  const restricted = !!draft?.target.role || !!draft?.target.eventDayId;
  const saveLabel = draft ? 'Save changes' : 'Save private draft';
  return (
    <fieldset disabled={readonly || form.save.isPending} className="flex min-w-0 flex-col gap-md">
      <Field id="draft-body" label="Draft message" error={form.errors.body}>
        {(props) => (
          <Textarea
            {...props}
            value={form.body}
            onChange={(event) => form.setBody(event.target.value)}
            rows={4}
            maxLength={1000}
          />
        )}
      </Field>
      <ChoiceGroup
        legend="Draft priority"
        name="draft-priority"
        value={form.priority}
        onChange={form.setPriority}
        options={[
          { value: 'INFO', label: PRIORITY_LABELS.INFO },
          { value: 'OPERATIONAL', label: PRIORITY_LABELS.OPERATIONAL },
          { value: 'URGENT', label: PRIORITY_LABELS.URGENT },
        ]}
      />
      <DraftAudience form={form} me={me} />
      {restricted ? (
        <p className="text-caption">Saved role/day audience restrictions will be retained.</p>
      ) : null}
      <Field
        id="draft-expiry"
        label={`Expiry (${me.event.timezone})`}
        optional
        error={form.errors.expiresWallTime}
      >
        {(props) => (
          <Input
            {...props}
            type="datetime-local"
            value={form.expiresWallTime}
            onChange={(event) => form.setExpiresWallTime(event.target.value)}
          />
        )}
      </Field>
      <Button className="self-start" disabled={form.body.trim().length < 3} onClick={form.submit}>
        {form.save.isPending ? 'Saving…' : saveLabel}
      </Button>
    </fieldset>
  );
}
