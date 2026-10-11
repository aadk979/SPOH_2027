import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardBatchForm } from '../../src/features/cards/components/CardBatchForm';
import { CreateGiftForm } from '../../src/features/gifts/components/CreateGiftForm';
import { GiftStockForm } from '../../src/features/gifts/components/GiftStockForm';

const api = vi.hoisted(() => ({
  generate: vi.fn(),
  print: vi.fn(),
  download: vi.fn(),
  create: vi.fn(),
  adjust: vi.fn(),
}));
vi.mock('@/shared/lib/eventContext', () => ({ useEventId: () => 'event-a' }));
vi.mock('@/features/session', () => ({
  useCurrentSession: () => ({ volunteerId: 'print-manager' }),
  useAllows: () => () => true,
}));
vi.mock('../../src/features/cards/api', () => ({
  generateCardBatch: api.generate,
  printCardBatch: api.print,
  downloadCardPrint: api.download,
}));
vi.mock('../../src/features/gifts/api', () => ({
  createGiftType: api.create,
  adjustGiftStock: api.adjust,
  updateGiftType: vi.fn(),
  listGifts: vi.fn(),
}));
const gift = {
  id: 'gift-a',
  name: 'Badge',
  initialStock: 20,
  lowStockThreshold: 5,
  active: true,
  remaining: 20,
  redeemed: 0,
  adjustment: 0,
  lowStock: false,
  outOfStock: false,
};
const mount = (child: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {child}
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);
it('validates the print batch and passes its exact fresh card codes to the export producer', async () => {
  api.generate.mockResolvedValue({
    batchLabel: 'First',
    created: 1,
    rehearsal: false,
    csv: 'shortCode,qrPayload,batchLabel,mode\nABC123,opaque,First,LIVE',
  });
  api.print.mockResolvedValue({
    id: 'export-a',
    format: 'pdf',
    count: 1,
    rehearsal: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  mount(<CardBatchForm />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate card batch' }));
  expect(api.generate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Batch label'), { target: { value: 'First' } });
  fireEvent.change(screen.getByLabelText('Number of cards'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate card batch' }));
  await screen.findByText('1 live cards generated.');
  fireEvent.click(screen.getByRole('button', { name: 'Prepare PDF' }));
  await waitFor(() =>
    expect(api.print).toHaveBeenCalledWith('event-a', {
      shortCodes: ['ABC123'],
      format: 'pdf',
      idempotencyKey: expect.any(String),
    }),
  );
  await screen.findByRole('button', { name: 'Download PDF' });
});
it('records opening stock and refuses a zero stock correction', async () => {
  api.create.mockResolvedValue(gift);
  mount(<CreateGiftForm />);
  fireEvent.change(screen.getByLabelText('Gift name'), { target: { value: 'Badge' } });
  fireEvent.change(screen.getByLabelText('Opening stock'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add gift type' }));
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith('event-a', {
      name: 'Badge',
      initialStock: 20,
      lowStockThreshold: 50,
      idempotencyKey: expect.any(String),
    }),
  );
  cleanup();
  mount(<GiftStockForm gift={gift} />);
  fireEvent.change(screen.getByLabelText('Reason for stock change'), {
    target: { value: 'Delivery' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record stock change' }));
  expect(api.adjust).not.toHaveBeenCalled();
  expect(await screen.findByText('A zero adjustment records nothing')).toBeTruthy();
});
it('keeps the same stock receipt after a transport failure and replaces it after success', async () => {
  api.adjust.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(gift);
  mount(<GiftStockForm gift={gift} />);
  fireEvent.change(screen.getByLabelText('Stock change'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Reason for stock change'), {
    target: { value: 'Delivery' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record stock change' }));
  await screen.findByText(/Stock was not confirmed/);
  const first = api.adjust.mock.calls[0]![1].body.idempotencyKey;
  fireEvent.click(screen.getByRole('button', { name: 'Record stock change' }));
  await screen.findByText('Stock change recorded.');
  expect(api.adjust.mock.calls[1]![1].body.idempotencyKey).toBe(first);
});
