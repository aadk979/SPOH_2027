import { useState, type FormEvent, type ReactNode } from 'react';
import { EventContent, type ContentDraftRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Callout, Stack } from '@/shared/ui';
import { EMPTY_CONTENT } from '../model/contentEditor';
import { useSaveContent } from '../queries';
import { BriefEditor } from './BriefEditor';
import { JourneyEditor } from './JourneyEditor';
import { MapEditor } from './MapEditor';
import { BriefingEditor } from './BriefingEditor';
import { ContentPreview } from './ContentPreview';
export function ContentEditor({ draft }: { draft: ContentDraftRecord }): ReactNode {
  const form = useZodForm(EventContent, draft.body ?? EMPTY_CONTENT);
  const save = useSaveContent();
  const [preview, setPreview] = useState(false);
  function submit(event: FormEvent): void {
    event.preventDefault();
    const body = form.validate();
    if (body) save.mutate({ expectedVersion: draft.version, body });
  }
  return (
    <form onSubmit={submit}>
      <Stack>
        <p>
          Draft {draft.version}. Saving changes requires a fresh review before they can be
          published.
        </p>
        <BriefEditor
          value={form.values.brief}
          errors={form.errors}
          onChange={form.setter('brief')}
        />
        <JourneyEditor
          value={form.values.journey}
          errors={form.errors}
          onChange={form.setter('journey')}
        />
        <MapEditor value={form.values.map} errors={form.errors} onChange={form.setter('map')} />
        <BriefingEditor
          value={form.values.briefing}
          errors={form.errors}
          onChange={form.setter('briefing')}
        />
        <div className="flex flex-wrap gap-sm">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save draft'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setPreview(!preview)}>
            Preview guide
          </Button>
        </div>
      {Object.values(form.errors).some(Boolean) ? (
          <Callout tone="alert" role="alert">
            Check the marked fields before saving.
          </Callout>
        ) : null}
        {save.error ? (
          <Callout tone="alert" role="alert">
            {save.error.message} Reload the draft if another organiser changed it.
          </Callout>
        ) : null}
        {preview ? <ContentPreview body={form.values} /> : null}
      </Stack>
    </form>
  );
}
