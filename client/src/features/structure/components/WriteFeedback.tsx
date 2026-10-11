import { Callout } from '@/shared/ui';
export function WriteFeedback({
  error,
  saved,
  formError,
}: {
  error: Error | null;
  saved: boolean;
  formError?: string;
}) {
  return (
    <>
      {formError ? (
        <Callout tone="alert" role="alert">
          {formError}
        </Callout>
      ) : null}
      {error ? (
        <Callout tone="alert" role="alert">
          {error.message}
        </Callout>
      ) : null}
      {saved ? (
        <Callout tone="ok" role="status">
          Saved.
        </Callout>
      ) : null}
    </>
  );
}
