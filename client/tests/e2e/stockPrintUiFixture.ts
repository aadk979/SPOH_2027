import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  AdjustGiftStockWithReceiptRequest,
  CardPrintExportDetail,
  CardPrintExportListQuery,
  CardPrintExportListResponse,
  CreateGiftTypeRequest,
  GenerateCardBatchRequest,
  GenerateCardBatchResponse,
  GiftListResponse,
  GiftTypeRecord,
  IdempotencyKey,
  PrintCardBatchRequest,
  UpdateGiftTypeRequest,
  type Action,
  type EventStatus,
} from '@spoh/shared';
import { IDENTITY_EVENT, IDENTITY_PERSON, IDENTITY_SESSION } from './identityUiFixture';
import { fulfillClientConfiguration } from './mockEvent';

export const PRINT_CODES = ['ABC123', 'DEF456'];
export const PRINT_CSV =
  'shortCode,qrPayload,batchLabel,mode\nABC123,synthetic-qr-a,Browser batch,REHEARSAL\nDEF456,synthetic-qr-b,Browser batch,REHEARSAL';
export const PRINT_CONTEXT = {
  eventName: 'Frozen Mock Event',
  stampingStations: [{ id: 'frozen-station', name: 'Frozen stamping room' }],
  batches: PRINT_CODES.map((shortCode) => ({ shortCode, batchLabel: 'Browser batch' })),
};
export const STOCK_ACTIONS: Action[] = [
  'Self.Read',
  'Card.GenerateBatch',
  'Report.Export',
  'Settings.Read',
  'Structure.Change',
  'Structure.Edit',
  'Count.Adjust',
];
export const STORED_PDF = CardPrintExportDetail.parse({
  id: 'print-pdf',
  format: 'pdf',
  count: 2,
  rehearsal: true,
  createdAt: '2026-10-10T00:00:00.000Z',
  shortCodes: PRINT_CODES,
  printContext: PRINT_CONTEXT,
});
export const STORED_ZIP = CardPrintExportDetail.parse({
  ...STORED_PDF,
  id: 'print-zip',
  format: 'zip',
  printContext: null,
});
export const EXISTING_GIFT = GiftTypeRecord.parse({
  id: 'existing-gift',
  name: 'Existing Badge',
  initialStock: 20,
  rehearsal: true,
  lowStockThreshold: 15,
  active: true,
  remaining: 14,
  redeemed: 8,
  adjustment: 2,
  lowStock: true,
  outOfStock: false,
});
export async function printPayloads() {
  const document = await PDFDocument.create();
  document.addPage().drawText('Synthetic browser print: ABC123 DEF456');
  const pdf = Buffer.from(await document.save());
  const archive = new JSZip();
  archive.file('cards.pdf', pdf);
  archive.file('cards.csv', PRINT_CSV);
  archive.file('print-context.json', JSON.stringify(PRINT_CONTEXT));
  archive.file('README.txt', 'Synthetic browser fixture; print at actual size.');
  return { pdf, zip: await archive.generateAsync({ type: 'nodebuffer' }) };
}
type PrintPayloads = Awaited<ReturnType<typeof printPayloads>>;
export function stockPrintState(
  bytes: PrintPayloads,
  options: { history?: boolean; faults?: boolean } = {},
) {
  return {
    bytes,
    history: options.history ? [STORED_PDF, STORED_ZIP] : [],
    gifts: [structuredClone(EXISTING_GIFT)],
    generation: [] as GenerateCardBatchRequest[],
    prints: [] as PrintCardBatchRequest[],
    downloads: [] as string[],
    creates: [] as CreateGiftTypeRequest[],
    updates: [] as UpdateGiftTypeRequest[],
    adjustments: [] as AdjustGiftStockWithReceiptRequest[],
    historyReads: [] as string[],
    detailReads: [] as string[],
    catalogueReads: 0,
    unexpected: [] as string[],
    faults: options.faults ?? false,
  };
}
export type StockPrintState = ReturnType<typeof stockPrintState>;
const EVENT_ROOT = `/api/v1/events/${IDENTITY_EVENT.id}`;
async function unavailable(route: Route) {
  await route.fulfill({
    status: 503,
    json: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Synthetic storage unavailable',
        requestId: 'synthetic-print-request',
      },
    },
  });
}
async function core(route: Route, actions: Action[], phase: EventStatus) {
  const { pathname, search } = new URL(route.request().url());
  const method = route.request().method();
  if (pathname === '/api/v1/client-config') {
    expect(method).toBe('GET');
    expect(search).toBe('');
    return fulfillClientConfiguration(route);
  }
  if (pathname === '/api/v1/auth/refresh') {
    expect(method).toBe('POST');
    expect(search).toBe('');
    await route.fulfill({ json: IDENTITY_SESSION });
    return true;
  }
  const event = { ...IDENTITY_EVENT, status: phase };
  const bodies: Record<string, unknown> = {
    '/api/v1/events': { data: [event] },
    [`${EVENT_ROOT}/me`]: {
      volunteer: IDENTITY_PERSON,
      event,
      currentAssignment: null,
      upcomingAssignments: [],
      escalationChain: [],
    },
    [`${EVENT_ROOT}/me/permissions`]: {
      actions: Object.fromEntries(actions.map((action) => [action, true])),
      settings: { operational: false, security: false, privacy: false },
    },
    [`${EVENT_ROOT}/lost-person/active`]: { alerts: [] },
    [`${EVENT_ROOT}/registrations/categories`]: { data: [] },
  };
  if (!(pathname in bodies)) return false;
  expect(method).toBe('GET');
  expect(search).toBe('');
  expect(route.request().headers()['authorization']).toBe(`Bearer ${IDENTITY_SESSION.accessToken}`);
  await route.fulfill({ json: bodies[pathname] });
  return true;
}
async function cards(route: Route, state: StockPrintState) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();
  if (path === `${EVENT_ROOT}/cards/batch`) {
    expect(method).toBe('POST');
    expect(url.search).toBe('');
    const body = GenerateCardBatchRequest.parse(route.request().postDataJSON());
    expect(body).toEqual({
      batchLabel: 'Browser batch',
      count: 2,
      rehearsal: true,
      idempotencyKey: expect.any(String),
    });
    state.generation.push(body);
    if (state.faults && state.generation.length === 1) {
      await route.abort('failed');
      return true;
    }
    await route.fulfill({
      status: 201,
      json: GenerateCardBatchResponse.parse({
        batchLabel: body.batchLabel,
        created: 2,
        rehearsal: true,
        csv: PRINT_CSV,
      }),
    });
    return true;
  }
  if (path === `${EVENT_ROOT}/cards/print` && method === 'POST') {
    expect(url.search).toBe('');
    const body = PrintCardBatchRequest.parse(route.request().postDataJSON());
    expect(body.shortCodes).toEqual(PRINT_CODES);
    state.prints.push(body);
    const detail = body.format === 'pdf' ? STORED_PDF : STORED_ZIP;
    if (!state.history.some((record) => record.id === detail.id)) state.history.unshift(detail);
    if (state.faults && state.prints.length === 1) {
      await unavailable(route);
      return true;
    }
    const { shortCodes: _codes, printContext: _context, ...record } = detail;
    await route.fulfill({ status: 201, json: { data: record } });
    return true;
  }
  if (path === `${EVENT_ROOT}/cards/print`) {
    expect(method).toBe('GET');
    const query = CardPrintExportListQuery.parse(Object.fromEntries(url.searchParams));
    expect(query.limit).toBe(20);
    state.historyReads.push(query.cursor ?? 'first');
    const slice = query.cursor ? state.history.slice(1) : state.history.slice(0, 1);
    if (query.cursor) expect(query.cursor).toBe(state.history[0]?.id);
    const data = slice.map(({ shortCodes: _codes, printContext: _context, ...record }) => record);
    await route.fulfill({
      json: CardPrintExportListResponse.parse({
        data,
        meta: {
          count: state.history.length,
          nextCursor: !query.cursor && state.history.length > 1 ? state.history[0]!.id : null,
        },
      }),
    });
    return true;
  }
  const detail = state.history.find(
    (record) => path === `${EVENT_ROOT}/cards/print/${record.id}/details`,
  );
  if (detail) {
    expect(method).toBe('GET');
    expect(url.search).toBe('');
    state.detailReads.push(detail.id);
    await route.fulfill({ json: { data: detail } });
    return true;
  }
  const file = state.history.find((record) => path === `${EVENT_ROOT}/cards/print/${record.id}`);
  if (!file) return false;
  expect(method).toBe('GET');
  expect(url.search).toBe('');
  expect(route.request().headers()['cache-control']).toContain('no-cache');
  state.downloads.push(file.id);
  if (state.faults && state.downloads.length === 1) {
    await unavailable(route);
    return true;
  }
  await route.fulfill({
    body: state.bytes[file.format],
    headers: {
      'Content-Type': file.format === 'pdf' ? 'application/pdf' : 'application/zip',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="cards-${file.id}.${file.format}"`,
    },
  });
  return true;
}
async function gifts(route: Route, state: StockPrintState) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  if (path === `${EVENT_ROOT}/gifts/catalogue`) {
    expect(route.request().method()).toBe('GET');
    expect(url.search).toBe('');
    state.catalogueReads++;
    await route.fulfill({
      json: GiftListResponse.parse({ data: state.gifts, meta: { count: state.gifts.length } }),
    });
    return true;
  }
  if (path === `${EVENT_ROOT}/admin/gift-types`) {
    expect(route.request().method()).toBe('POST');
    expect(url.search).toBe('');
    const body = CreateGiftTypeRequest.parse(route.request().postDataJSON());
    IdempotencyKey.parse(body.idempotencyKey);
    expect(body).toEqual({
      name: 'New Tote',
      initialStock: 30,
      lowStockThreshold: 10,
      idempotencyKey: expect.any(String),
    });
    state.creates.push(body);
    const gift = GiftTypeRecord.parse({
      ...EXISTING_GIFT,
      id: 'new-gift',
      name: body.name,
      initialStock: body.initialStock,
      lowStockThreshold: body.lowStockThreshold,
      remaining: 30,
      redeemed: 0,
      adjustment: 0,
      lowStock: false,
    });
    state.gifts.push(gift);
    await route.fulfill({ status: 201, json: { giftType: gift } });
    return true;
  }
  const gift = state.gifts[0]!;
  if (path === `${EVENT_ROOT}/admin/gift-types/${gift.id}`) {
    expect(route.request().method()).toBe('PATCH');
    expect(url.search).toBe('');
    const body = UpdateGiftTypeRequest.parse(route.request().postDataJSON());
    IdempotencyKey.parse(body.idempotencyKey);
    expect(body).toEqual({
      name: 'Badge corrected',
      lowStockThreshold: 4,
      active: false,
      idempotencyKey: expect.any(String),
    });
    state.updates.push(body);
    Object.assign(gift, {
      name: body.name,
      lowStockThreshold: body.lowStockThreshold,
      active: body.active,
      lowStock: false,
    });
    await route.fulfill({ json: { giftType: GiftTypeRecord.parse(gift) } });
    return true;
  }
  if (path !== `${EVENT_ROOT}/gifts/${gift.id}/stock`) return false;
  expect(route.request().method()).toBe('POST');
  expect(url.search).toBe('');
  const body = AdjustGiftStockWithReceiptRequest.parse(route.request().postDataJSON());
  expect(body).toEqual({
    delta: 5,
    reason: 'Verified delivery of five badges',
    expectedRehearsal: true,
    idempotencyKey: expect.any(String),
  });
  state.adjustments.push(body);
  if (state.adjustments.length === 1) {
    gift.adjustment += body.delta;
    gift.remaining = gift.initialStock + gift.adjustment - gift.redeemed;
  }
  if (state.faults && state.adjustments.length === 1) {
    await unavailable(route);
    return true;
  }
  await route.fulfill({ json: { giftType: GiftTypeRecord.parse(gift) } });
  return true;
}
export async function installStockPrintUi(
  page: Page,
  state: StockPrintState,
  options: { actions?: Action[]; phase?: EventStatus } = {},
) {
  await page.route('**/api/v1/**', async (route) => {
    if (await core(route, options.actions ?? STOCK_ACTIONS, options.phase ?? 'REHEARSAL')) return;
    expect(route.request().headers()['authorization']).toBe(
      `Bearer ${IDENTITY_SESSION.accessToken}`,
    );
    if ((await cards(route, state)) || (await gifts(route, state))) return;
    const unexpected = `${route.request().method()} ${new URL(route.request().url()).pathname}`;
    state.unexpected.push(unexpected);
    await route.abort('failed');
    throw new Error(`Unexpected stock/print UI request: ${unexpected}`);
  });
}
