import { Button, Card, CardTitle, Stack, ErrorState } from '@/shared/ui';
import { useBulkFootfallForm } from '../hooks/useBulkFootfallForm';
import { BulkFootfallFields } from './BulkFootfallFields';
import { CorrectionReason } from './CorrectionReason';
import { CorrectionOutcome } from './CorrectionOutcome';

export function BulkFootfallForm() {
  const control = useBulkFootfallForm();
  return (
    <Card>
      <Stack>
        <CardTitle>Add a paper footfall total</CardTitle>
        <p>
          Enter room entries for this block. Confirm these entries have not already been tapped into
          the app.
        </p>
        <BulkFootfallFields control={control} />
        <CorrectionReason
          id="bulk-reason"
          value={control.form.values.reason}
          error={control.form.errors.reason}
          onChange={control.form.setter('reason')}
        />
        <Button disabled={control.mutation.isPending} onClick={control.submit}>
          Record paper total
        </Button>
        {control.error ? (
          <ErrorState error={control.error}>{control.error}</ErrorState>
        ) : null}
        <CorrectionOutcome error={control.mutation.error} saved={control.mutation.isSuccess} />
      </Stack>
    </Card>
  );
}
