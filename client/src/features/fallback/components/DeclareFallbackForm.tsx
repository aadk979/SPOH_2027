import type { ReactNode } from 'react';
import type { FallbackController } from '../hooks/useFallbackScreen';
import { Card, CardTitle, ChoiceGroup, Field, Textarea, Button } from '@/shared/ui';
import { FallbackScopeField } from './FallbackScopeField';
export function DeclareFallbackForm({ controller }: { controller: FallbackController }): ReactNode {
  const { tier, setTier, reason, setReason, error, declare } = controller;
  return (
    <Card as="section" className="flex max-w-panel flex-col gap-md">
      <div>
        <CardTitle>Declare a fallback window</CardTitle>
        <p className="mt-xs text-caption text-text-muted">
          This records that data for a period was captured off-app, so every report covering it says
          so. It does not switch anyone over —{' '}
          <strong>announce the change in the Safety Communications Chat</strong> as well.
        </p>
      </div>

      <ChoiceGroup
        legend="Which tier?"
        name="fallback-tier"
        value={tier}
        onChange={setTier}
        layout="list"
        options={[
          {
            value: '3',
            label: 'Tier 3 — Google fallback pack',
            hint: 'App or backend unavailable, network fine',
          },
          { value: '4', label: 'Tier 4 — paper pack', hint: 'Total digital failure' },
        ]}
      />

      <FallbackScopeField controller={controller} />

      <Field id="reason" label="What has happened?" error={error}>
        {(props) => (
          <Textarea
            {...props}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Backend unreachable from the booth since 11:15"
          />
        )}
      </Field>

      {/*
            Amber rather than blue. Declaring is not destructive, but it marks
            every report that covers the period — it should not look like the
            same class of act as picking a station from a dropdown.
          */}
      <Button
        variant="warn"
        size="lg"
        block
        disabled={reason.trim().length < 3 || declare.isPending}
        onClick={() => declare.mutate()}
      >
        {declare.isPending ? 'Declaring…' : `Declare Tier ${tier}`}
      </Button>
    </Card>
  );
}
