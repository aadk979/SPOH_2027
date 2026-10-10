import { type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { VerifyMfaRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { sessionFromResponse, setSession } from '@/shared/lib/session';
import { Button, Callout, Field, Input, Stack } from '@/shared/ui';
import { useStartMfa, useVerifyMfa } from '../queries';

export function MfaEnrollment(): ReactNode {
  const router = useRouter();
  const setup = useStartMfa();
  const verify = useVerifyMfa();
  const form = useZodForm(VerifyMfaRequest, { code: '' });
  function submit(event: FormEvent): void {
    event.preventDefault();
    const body = form.validate();
    if (body)
      verify.mutate(body.code, {
        onSuccess: (response) => {
          setSession(sessionFromResponse(response));
          router.replace('/events');
        },
      });
  }
  return (
    <Stack>
      <p>
        Your access needs an authenticator app. Add the setup key below to your authenticator, then
        enter its six-digit code. The key expires after five minutes.
      </p>
      {!setup.data ? (
        <Button disabled={setup.isPending} onClick={() => setup.mutate()}>
          Get setup key
        </Button>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-sm">
          <p className="font-mono break-all" aria-label="Authenticator setup key">
            {setup.data.secretCode}
          </p>
          <Field id="mfa-code" label="Six-digit code" error={form.errors.code}>
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={form.values.code}
                onChange={(event) => form.setField('code', event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" disabled={verify.isPending}>
            {verify.isPending ? 'Checking…' : 'Verify authenticator'}
          </Button>
        </form>
      )}
      {setup.isError || verify.isError ? (
        <Callout tone="alert" role="alert">
          {setup.error?.message ?? verify.error?.message}
        </Callout>
      ) : null}
    </Stack>
  );
}
