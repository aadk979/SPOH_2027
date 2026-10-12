import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { z } from 'zod';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { ErrorState, QueryState, MutationFeedback, ConfirmationDialog, ToastProvider, useToast, Field, Input } from '@/shared/ui';
import { useZodForm } from '@/shared/hooks/useZodForm';

afterEach(cleanup);
function apiError(status: number) {
  return new ApiError(status, { code: 'NOT_PERMITTED', message: 'The current policy restricts this action.', requestId: 'request-synthetic' });
}
describe('shared truthful feedback', () => {
  it.each([401, 403, 404])('does not offer transport retry for %s or expose stale children', (status) => {
    render(<ErrorState error={apiError(status)} onRetry={vi.fn()}><button>Try again</button>Cached private name</ErrorState>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Cached private name')).toBeNull();
    expect(screen.getByText(/request-synthetic/)).toBeDefined();
  });
  it('retains a safe policy reason and request ID', () => {
    render(<ErrorState error={apiError(403)} />);
    expect(screen.getByText('The current policy restricts this action.')).toBeDefined();
    expect(screen.getByText('request-synthetic')).toBeDefined();
  });
  it('never displays an unknown exception or server SQL detail', () => {
    const error = new ApiError(500, { code: 'INTERNAL', message: 'SELECT secret_person FROM users', requestId: 'safe-id' });
    const { rerender } = render(<ErrorState error={error} />);
    expect(screen.queryByText(/secret_person/)).toBeNull();
    rerender(<ErrorState error={new Error('password=SYNTHETIC_PRIVATE')} />);
    expect(screen.queryByText(/SYNTHETIC_PRIVATE/)).toBeNull();
  });
  it('offers an explicit retry for network failure', () => {
    const retry = vi.fn();
    render(<ErrorState error={new NetworkError('synthetic')} operation="Loading records" onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading records' }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it('renders disabled read authority as denied rather than endless loading', () => {
    render(<QueryState allowed={false} query={{ error: null, isPending: true, refetch: vi.fn() }} operation="Loading" isEmpty={() => true} empty={{ title: 'Empty', description: 'No records' }}>{() => 'Private'}</QueryState>);
    expect(screen.getByText('Access unavailable')).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('does not describe an error as confirmed success', () => {
    render(<MutationFeedback error={new NetworkError('synthetic')} saved success="Confirmed" />);
    expect(screen.queryByText('Confirmed')).toBeNull();
  });
});

function ConfirmationHarness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Remove selected item</button>
    <ConfirmationDialog open={open} title="Remove synthetic item" confirmLabel="Confirm removal" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)}>The reviewed item changes.</ConfirmationDialog></>;
}
describe('confirmation and owner feedback', () => {
  it('starts on cancel and restores focus without committing', () => {
    render(<ConfirmationHarness />);
    const origin = screen.getByRole('button', { name: 'Remove selected item' });
    origin.focus(); fireEvent.click(origin);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(origin);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('blocks duplicate confirmation and cancellation while pending', () => {
    const confirm = vi.fn(); const cancel = vi.fn();
    render(<ConfirmationDialog open title="Reviewed target" confirmLabel="Save" pending onConfirm={confirm} onCancel={cancel}>Frozen input</ConfirmationDialog>);
    fireEvent.click(screen.getByRole('button', { name: 'Confirming…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
  });
  it('drops retained toast labels across owner change', () => {
    function Result() { const announce = useToast(); return <button onClick={() => announce('Private owner result')}>Confirm synthetic result</button>; }
    const { rerender } = render(<ToastProvider ownerKey="owner-a"><Result /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm synthetic result' }));
    expect(screen.getByText('Private owner result')).toBeDefined();
    rerender(<ToastProvider ownerKey="owner-b"><Result /></ToastProvider>);
    expect(screen.queryByText('Private owner result')).toBeNull();
  });
});

it('focuses the first invalid field inside the submitted form', () => {
  function Form() {
    const form = useZodForm(z.object({ first: z.string().min(1), second: z.string().min(1) }), { first: '', second: '' });
    return <form onSubmit={(event) => { event.preventDefault(); form.validate(); }}>
      <Field id="first" label="First" error={form.errors.first}>{(props) => <Input {...props} value={form.values.first} onChange={() => undefined} />}</Field>
      <Field id="second" label="Second" error={form.errors.second}>{(props) => <Input {...props} value={form.values.second} onChange={() => undefined} />}</Field>
      <button type="submit">Submit invalid form</button>
    </form>;
  }
  render(<Form />);
  const submit = screen.getByRole('button', { name: 'Submit invalid form' }); submit.focus(); fireEvent.click(submit);
  expect(document.activeElement).toBe(screen.getByLabelText('First'));
});
