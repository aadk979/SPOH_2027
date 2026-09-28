import type { ReactNode } from 'react';
import type { GroupRegistrationForm } from '../hooks/useGroupRegistration';
import { Button, Callout, Card, Field, Input } from '@/shared/ui';
export function GroupSubmitForm({ form }: { form: GroupRegistrationForm }): ReactNode {
  const { submit, shortCode, setShortCode, error, total, saving } = form;
  return (
    <Card
      as="form"
      variant="flat"
      className="flex flex-col gap-md"
      onSubmit={(event: React.FormEvent) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field
        id="short-code"
        label="Mission Card code"
        optional
        hint="Six characters, printed under the QR code."
        error={
          shortCode.trim().length > 0 && shortCode.trim().length !== 6
            ? 'Card code must be exactly 6 characters.'
            : null
        }
      >
        {(props) => (
          <Input
            {...props}
            value={shortCode}
            onChange={(event) =>
              setShortCode(event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
            }
            onPaste={(event) => {
              event.preventDefault();
              const pasted = event.clipboardData.getData('text');
              const cleaned = pasted
                .replace(/[^a-zA-Z0-9]/g, '')
                .toUpperCase()
                .slice(0, 6);
              setShortCode(cleaned);
            }}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="6 characters"
            scale="lg"
            className="font-display tracking-[0.2em] uppercase"
          />
        )}
      </Field>

      {error ? (
        <Callout tone="alert" role="alert">
          {error}
        </Callout>
      ) : null}

      <Button
        type="submit"
        size="lg"
        block
        disabled={
          total === 0 || saving || (shortCode.trim().length > 0 && shortCode.trim().length !== 6)
        }
      >
        {total === 0
          ? 'Add at least one person'
          : `Register ${total} ${total === 1 ? 'person' : 'people'}`}
      </Button>
    </Card>
  );
}
