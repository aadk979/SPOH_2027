import { Callout } from '@/shared/ui';

export function MutationFeedback({ error, saved }: { error: Error | null; saved: boolean }) {
  if (error)
    return (
      <Callout tone="alert" role="alert">
        {error.message}
      </Callout>
    );
  return saved ? (
    <Callout tone="ok" role="status">
      Saved. The roster has refreshed.
    </Callout>
  ) : null;
}
