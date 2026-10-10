import type { RolePermissionsResponse } from '@spoh/shared';
import { Button, Callout, Checkbox, Field, Input, Section } from '@/shared/ui';
import { usePermissionReview } from '../hooks/usePermissionReview';

/** A review is explicit and invalidated as soon as the current grant version changes. */
export function PermissionReviewPanel({ table }: { table: RolePermissionsResponse['data'] }) {
  const editor = usePermissionReview(table.review?.version ?? 0);
  const { form, mutation } = editor;
  const review = table.review;
  if (!review) return null;
  const reviewed = review.reviewedAt !== null && review.reviewedVersion === review.version;
  return (
    <Section title="Permissions review">
      <p>
        {reviewed ? 'Current permissions are reviewed.' : 'Current permissions need review.'}{' '}
        Version {review.version}.
      </p>
      {table.canEdit ? (
        <>
          <Field
            id="permission-review-reason"
            label="Review reason"
            error={form.errors.reason}
            hint="Record what you checked before the event goes live."
          >
            {(props) => (
              <Input
                {...props}
                value={form.values.reason}
                maxLength={500}
                disabled={editor.frozen}
                onChange={(event) => {
                  form.setField('reason', event.target.value);
                  editor.setConfirmed(false);
                }}
              />
            )}
          </Field>
          <Checkbox
            label="I have reviewed the current role permissions and guardrails"
            checked={editor.confirmed}
            disabled={editor.frozen}
            onChange={(event) => editor.setConfirmed(event.target.checked)}
          />
          <Button variant="secondary" disabled={editor.disabled} onClick={editor.submit}>
            {editor.label}
          </Button>
        </>
      ) : null}
      {mutation.isError ? (
        <Callout tone="alert" role="alert">
          Could not confirm the review. Retry the same request, or reload and review current
          permissions.
        </Callout>
      ) : null}
    </Section>
  );
}
