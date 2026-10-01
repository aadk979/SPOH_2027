import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitorCaptureForm } from '@/features/visitor';

const capture = vi.hoisted(() => vi.fn());

vi.mock('@/features/visitor/api', () => ({ captureVisitorRegistration: capture }));
vi.mock('@/features/visitor/queries', () => ({
  useVisitorFields: () => ({
    data: [
      {
        id: 'field-1',
        code: 'contact',
        label: 'Contact email',
        type: 'email',
        classification: 'visitor-personal',
        retentionDays: 7,
        readers: ['CHIEF_COORDINATOR'],
        sortOrder: 0,
        active: true,
      },
    ],
  }),
}));

beforeEach(() => capture.mockReset());
afterEach(cleanup);

function renderForm() {
  render(
    <VisitorCaptureForm stationId="station-1" categories={[{ code: 'SEC_4', label: 'Sec 4' }]} />,
  );
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'SEC_4' } });
  fireEvent.change(screen.getByLabelText(/Contact email/), {
    target: { value: 'visitor@example.test' },
  });
}

describe('visitor details capture', () => {
  it('shows the field retention and sends a registration directly after confirmation', async () => {
    capture.mockResolvedValue(undefined);
    renderForm();
    expect(screen.getByText('Kept for 7 days after the event closes.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record with details' }));
    await waitFor(() => expect(capture).toHaveBeenCalledOnce());
    expect(capture.mock.calls[0]?.[1]).toMatchObject({
      category: 'SEC_4',
      stationId: 'station-1',
      visitor: { contact: 'visitor@example.test' },
    });
    expect(screen.getByRole('status').textContent).toContain('Registration recorded');
    expect(screen.getByLabelText(/Contact email/)).toHaveProperty('value', '');
  });

  it('keeps the same idempotency key after a lost response, without clearing the details', async () => {
    capture.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Record with details' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByLabelText(/Contact email/)).toHaveProperty('value', 'visitor@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Record with details' }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(capture.mock.calls[1]?.[1].idempotencyKey).toBe(
      capture.mock.calls[0]?.[1].idempotencyKey,
    );
  });
});
