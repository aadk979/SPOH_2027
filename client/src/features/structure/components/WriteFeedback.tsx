import { Callout, MutationFeedback } from '@/shared/ui';
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
      <MutationFeedback error={error} saved={saved} operation="Saving event structure" />
    </>
  );
}
