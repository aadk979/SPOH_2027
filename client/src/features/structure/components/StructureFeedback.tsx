import { Button, Callout, LoadingRows } from '@/shared/ui';
export function StructureFeedback({
  pending,
  error,
  reload,
}: {
  pending: boolean;
  error: Error | null;
  reload(): void;
}) {
  return (
    <>
      {pending ? <LoadingRows label="Loading event structure" /> : null}
      {error ? (
        <Callout tone="alert" role="alert">
          {error.message}
          <Button variant="secondary" onClick={reload}>
            Reload structure
          </Button>
        </Callout>
      ) : null}
    </>
  );
}
