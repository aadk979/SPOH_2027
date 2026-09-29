import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardShortCode } from '@spoh/shared';
import { CardCodeInput } from '@/features/capture';

afterEach(cleanup);

function renderInput() {
  const onSubmitCode = vi.fn();
  render(
    <CardCodeInput
      videoRef={{ current: null }}
      scannerState="denied"
      onSubmitCode={onSubmitCode}
      pending={false}
    />,
  );
  const input = screen.getByLabelText('Six-character card code');
  const submit = (value: string) => {
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(input.closest('form')!);
  };
  return { onSubmitCode, input, submit };
}

describe('card code entry (F03-020)', () => {
  it('reads the look-alikes as the digits the card prints', () => {
    const { onSubmitCode, submit } = renderInput();
    submit('abc12o');
    submit('7kl9i4');
    expect(onSubmitCode.mock.calls).toEqual([['ABC120'], ['7K1914']]);
  });

  it('rejects a letter the card alphabet never prints, with the server message', () => {
    const { onSubmitCode, input, submit } = renderInput();
    submit('ABCU12');
    expect(onSubmitCode).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      CardShortCode.safeParse('ABCU12').error?.issues[0]?.message,
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(input, { target: { value: 'ABC' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the box after a valid code so the next card can be typed', () => {
    const { input, submit } = renderInput();
    submit('ABC123');
    expect((input as HTMLInputElement).value).toBe('');
  });
});
