import { useState } from 'react';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Card, CardTitle, Checkbox, ChoiceGroup, Field, Input, Stack } from '@/shared/ui';
import { useVoidRecord } from '../queries';
import { VoidRecordFields } from '../model/correctionForms';
import { CorrectionReason } from './CorrectionReason';
import { CorrectionOutcome } from './CorrectionOutcome';
import { RecentRecordPicker } from './RecentRecordPicker';

export function VoidRecordForm() {
  const form = useZodForm(VoidRecordFields, {
    kind: 'registration' as 'registration' | 'footfall',
    recordId: '',
    reason: '',
  });
  const mutation = useVoidRecord();
  const [confirmed, setConfirmed] = useState(false);
  function submit() {
    const input = form.validate();
    if (input && confirmed) mutation.mutate(input, { onSuccess: () => setConfirmed(false) });
  }
  return (
    <Card>
      <Stack>
        <CardTitle>Void a counting record</CardTitle>
        <p>
          Choose the recorded count to correct. Voiding removes its contribution from current
          counts; frozen reports stay as recorded.
        </p>
        <ChoiceGroup
          legend="Record type"
          name="void-kind"
          value={form.values.kind}
          options={[
            { value: 'registration', label: 'Registration' },
            { value: 'footfall', label: 'Footfall tick' },
          ]}
          onChange={(kind) => {
            form.setField('kind', kind);
            form.setField('recordId', '');
            setConfirmed(false);
          }}
        />
        <RecentRecordPicker
          key={form.values.kind}
          kind={form.values.kind}
          onChoose={(id) => {
            form.setField('recordId', id);
            setConfirmed(false);
          }}
        />
        <Field
          id="void-record-id"
          label="Selected record ID"
          hint="You can also paste an older record ID from the audit trail."
          error={form.errors.recordId}
        >
          {(props) => (
            <Input
              {...props}
              value={form.values.recordId}
              maxLength={64}
              onChange={(event) => {
                form.setField('recordId', event.target.value);
                setConfirmed(false);
              }}
            />
          )}
        </Field>
        <CorrectionReason
          id="void-reason"
          value={form.values.reason}
          error={form.errors.reason}
          onChange={form.setter('reason')}
        />
        <Checkbox
          label="I checked the record ID and intend to remove this count"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <Button variant="danger" disabled={!confirmed || mutation.isPending} onClick={submit}>
          Void record
        </Button>
        <CorrectionOutcome error={mutation.error} saved={mutation.isSuccess} />
      </Stack>
    </Card>
  );
}
