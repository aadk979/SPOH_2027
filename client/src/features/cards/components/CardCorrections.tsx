'use client';
import { VoidCardRequest, ReissueCardRequest, type MissionCardRecord } from '@spoh/shared';
import { useAllows } from '@/features/session';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Field, Input, Callout } from '@/shared/ui';
import { useCardCorrections } from '../queries';
export function CardCorrections({
  card,
  onChange,
}: {
  card: MissionCardRecord;
  onChange(card: MissionCardRecord): void;
}) {
  const allows = useAllows();
  const form = useZodForm(ReissueCardRequest, { reason: '', replacementShortCode: '' });
  const voidForm = useZodForm(VoidCardRequest, { reason: '' });
  const { voidMutation, reissue } = useCardCorrections(card, onChange);
  const pending = voidMutation.isPending || reissue.isPending;
  return (
    <div className="flex flex-col gap-sm">
      <ReasonField
        value={form.values.reason}
        error={form.errors.reason ?? voidForm.errors.reason}
        onChange={(value) => {
          form.setField('reason', value);
          voidForm.setField('reason', value);
        }}
      />
      {allows('Card.Void') ? (
        <Button
          variant="danger"
          disabled={pending || card.status === 'VOIDED'}
          onClick={() => {
            const body = voidForm.validate();
            if (body && window.confirm(`Void card ${card.shortCode}?`))
              voidMutation.mutate({ reason: body.reason });
          }}
        >
          Void this card
        </Button>
      ) : null}
      {allows('Card.Reissue') ? (
        <>
          <Field
            id="replacement-card"
            label="Replacement card code"
            hint="Choose a fresh, unused physical card."
            error={form.errors.replacementShortCode}
          >
            {(props) => (
              <Input
                {...props}
                value={form.values.replacementShortCode}
                onChange={(e) => form.setField('replacementShortCode', e.target.value)}
              />
            )}
          </Field>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              const body = form.validate();
              if (
                body &&
                window.confirm(`Move ${card.shortCode}'s journey to ${body.replacementShortCode}?`)
              )
                reissue.mutate(body);
            }}
          >
            Reissue onto replacement
          </Button>
        </>
      ) : null}
      {voidMutation.isError || reissue.isError ? (
        <Callout>
          Could not confirm this correction. Look up both card codes before trying again.
        </Callout>
      ) : null}
    </div>
  );
}
function ReasonField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange(value: string): void;
}) {
  return (
    <Field
      id="card-correction-reason"
      label="Correction reason"
      hint="This reason is recorded in the audit. Review the code before confirming."
      error={error}
    >
      {(props) => (
        <Input {...props} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
}
