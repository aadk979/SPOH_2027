import { useState, type ReactNode } from 'react';
import type { SwapRequestRecord } from '@spoh/shared';
import { Button, Callout, Card, Section } from '@/shared/ui';
import { useDecideSwap } from '@/features/roster';
/** Swap approvals. Two taps, per remediation/phases/P07-client-refactor.md. */
export function SwapQueue({
  swaps,
  onDecided,
}: {
  swaps: SwapRequestRecord[];
  onDecided(): void;
}): ReactNode {
  const [pending, setPending] = useState<string | null>(null);
  const mutation = useDecideSwap();
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
    setPending(id);
    setError(null);
    try {
      await mutation.mutateAsync({ id, decision });
      onDecided();
    } catch {
      setError('Could not update swap request. Check your connection and try again.');
    } finally {
      setPending(null);
    }
  }

  if (swaps.length === 0) return null;

  return (
    <Section title="Swap requests">
      {error ? (
        <Callout tone="alert" role="alert" className="mb-sm">
          {error}
        </Callout>
      ) : null}
      <ul className="flex flex-col gap-sm">
        {swaps.map((swap) => (
          <Card as="li" variant="flat" key={swap.id}>
            <p>
              <strong>{swap.requesterName}</strong> <span aria-hidden="true">→</span>
              <span className="sr-only">wants to swap with</span> <strong>{swap.targetName}</strong>
            </p>
            <p className="text-caption text-text-muted">
              {swap.stationName} · {swap.date} · {swap.shift.label}
              {swap.reason ? ` · ${swap.reason}` : ''}
            </p>

            <div className="mt-sm flex flex-wrap gap-sm">
              <Button
                disabled={pending === swap.id}
                onClick={() => void decide(swap.id, 'APPROVED')}
                aria-label={`Approve the swap from ${swap.requesterName} to ${swap.targetName}`}
              >
                Approve
              </Button>
              <Button
                variant="quiet"
                disabled={pending === swap.id}
                onClick={() => void decide(swap.id, 'REJECTED')}
                aria-label={`Reject the swap from ${swap.requesterName} to ${swap.targetName}`}
              >
                Reject
              </Button>
            </div>
          </Card>
        ))}
      </ul>
    </Section>
  );
}
