import type { ReactNode } from 'react';
import type { AttendanceController } from '../hooks/useAttendanceScreen';
import { Card, Button, Field, Input } from '@/shared/ui';
export function PinEntry({
  pin,
  setPin,
  send,
  submit,
}: Pick<AttendanceController, 'pin' | 'setPin' | 'send' | 'submit'>): ReactNode {
  return (
    <Card>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send({ method: 'PIN', pin });
        }}
        className="flex flex-col gap-sm"
      >
        <Field
          id="attendance-pin"
          label="Secondary verification PIN"
          hint="On mobile data or unable to scan? Ask your verifier for their current 10-digit PIN. An internet connection is still required."
        >
          {(props) => (
            <Input
              {...props}
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              pattern="[0-9]{10}"
              value={pin}
              placeholder="10-digit PIN"
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              onPaste={(event) => {
                event.preventDefault();
                const pasted = event.clipboardData.getData('text');
                const cleaned = pasted.replace(/\D/g, '').slice(0, 10);
                setPin(cleaned);
              }}
              scale="lg"
              className="text-center font-mono tracking-widest font-semibold"
            />
          )}
        </Field>
        <Button type="submit" disabled={pin.length !== 10 || submit.isPending}>
          {submit.isPending ? 'Verifying…' : 'Submit attendance with PIN'}
        </Button>
      </form>
    </Card>
  );
}
