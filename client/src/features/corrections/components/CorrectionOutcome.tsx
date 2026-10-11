import { Callout } from '@/shared/ui';

export function CorrectionOutcome({ error, saved }: { error: Error | null; saved: boolean }) {
  return (
    <>
      {error ? (
        <Callout tone="alert" role="alert">
          {error.message}
        </Callout>
      ) : null}
      {saved ? (
        <Callout role="status">
          Correction saved. The audit trail retains the original record and reason.
        </Callout>
      ) : null}
    </>
  );
}
