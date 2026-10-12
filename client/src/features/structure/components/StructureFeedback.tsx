import { Button, LoadingRows, ErrorState } from '@/shared/ui';
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
        <ErrorState error={error}><Button variant="secondary" onClick={reload}>
            Reload structure
          </Button></ErrorState>
      ) : null}
    </>
  );
}
