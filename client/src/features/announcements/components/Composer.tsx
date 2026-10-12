import type { ReactNode } from 'react';
import type { useMe } from '@/features/session';
import { Button, Callout, Card, ChoiceGroup, Field, Textarea, MutationFeedback } from '@/shared/ui';
import { PRIORITY_LABELS } from '../model/priority';
import { ComposerAudience } from './ComposerAudience';
import { useComposer } from '../hooks/useComposer';
export function Composer({ me }: { me: ReturnType<typeof useMe>['data'] }): ReactNode {
  const form = useComposer(me);
  const { body, setBody, priority, setPriority, error, send } = form;
  return (
    <Card as="section" className="flex flex-col gap-md">
      <h2 className="text-tagline">Send an announcement</h2>

      <Field id="announcement-body" label="Message" hint="Write the operational instruction recipients need. Private safety descriptions belong in their dedicated report." error={form.errors.body ?? error}>
        {(props) => (
          <Textarea
            {...props}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Room at capacity, ushers hold visitors at the entrance."
          />
        )}
      </Field>

      <ChoiceGroup
        legend="Priority"
        name="announcement-priority"
        error={form.errors.priority}
        value={priority}
        onChange={setPriority}
        options={[
          { value: 'INFO', label: PRIORITY_LABELS.INFO },
          { value: 'OPERATIONAL', label: PRIORITY_LABELS.OPERATIONAL },
          { value: 'URGENT', label: PRIORITY_LABELS.URGENT },
        ]}
      />

      {priority === 'URGENT' ? (
        <Callout tone="warn">
          Urgent can alert phones whose owner enabled urgent push. Operational push is optional; the notification centre retains messages independently of push delivery.
        </Callout>
      ) : null}

      <ComposerAudience form={form} me={me} />
      <MutationFeedback error={send.error} pending={send.isPending} saved={send.isSuccess} operation="Sending the announcement" success="Announcement sent to the selected audience." />
      <Button
        className="self-start"
        disabled={body.trim().length < 3 || send.isPending}
        onClick={form.submit}
      >
        {send.isPending ? 'Sending…' : 'Send'}
      </Button>
    </Card>
  );
}
