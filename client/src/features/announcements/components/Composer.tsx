import type { ReactNode } from 'react';
import type { useMe } from '@/features/session';
import { Button, Callout, Card, ChoiceGroup, Field, Textarea } from '@/shared/ui';
import { PRIORITY_LABELS } from '../model/priority';
import { ComposerAudience } from './ComposerAudience';
import { useComposer } from '../hooks/useComposer';
export function Composer({ me }: { me: ReturnType<typeof useMe>['data'] }): ReactNode {
  const form = useComposer(me);
  const { body, setBody, priority, setPriority, error, send } = form;
  return (
    <Card as="section" className="flex flex-col gap-md">
      <h2 className="text-tagline">Send an announcement</h2>

      <Field id="announcement-body" label="Message" error={error}>
        {(props) => (
          <Textarea
            {...props}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="DCDF at capacity, ushers hold at Welcome Lounge."
          />
        )}
      </Field>

      <ChoiceGroup
        legend="Priority"
        name="announcement-priority"
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
          Urgent is the only priority that pushes to phones. Use it sparingly — volunteers who get
          forty pushes stop reading them.
        </Callout>
      ) : null}

      <ComposerAudience form={form} me={me} />
      <Button
        className="self-start"
        disabled={body.trim().length < 3 || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? 'Sending…' : 'Send'}
      </Button>
    </Card>
  );
}
