import { expect, test, type Download, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { IDENTITY_EVENT } from './identityUiFixture';
import {
  installStockPrintUi,
  PRINT_CODES,
  PRINT_CONTEXT,
  PRINT_CSV,
  printPayloads,
  stockPrintState,
  type StockPrintState,
} from './stockPrintUiFixture';

const viewports = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'laptop', width: 1440, height: 900 },
];
async function downloadBytes(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The browser did not make the downloaded bytes available.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function downloadFrom(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return pending;
}
async function prepareBatch(page: Page, state: StockPrintState) {
  await page.getByLabel('Batch label').fill('Browser batch');
  await page.getByLabel('Number of cards').fill('2');
  await page.getByLabel('Rehearsal cards').check();
  await page.getByRole('button', { name: 'Generate card batch' }).click();
  await expect(
    page.getByText('Generation was not confirmed. Retry the same batch to check its result.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate card batch' }).click();
  await expect(page.getByText('2 rehearsal cards generated.')).toBeVisible();
  expect(state.generation).toHaveLength(2);
  expect(state.generation[0]!.idempotencyKey).toBe(state.generation[1]!.idempotencyKey);
}
async function verifyPrintDownloads(page: Page, state: StockPrintState) {
  await page.getByRole('button', { name: 'Prepare PDF', exact: true }).click();
  await expect(
    page.getByText('Could not prepare the print file. Retry when export storage is available.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Prepare PDF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeVisible();
  expect(state.prints[0]!.idempotencyKey).toBe(state.prints[1]!.idempotencyKey);
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await expect(
    page.getByText('Could not download this print file. Try again.', { exact: true }),
  ).toBeVisible();
  const pdf = await downloadFrom(page, 'Download PDF');
  expect(pdf.suggestedFilename()).toBe('cards-print-pdf.pdf');
  const pdfBytes = await downloadBytes(pdf);
  expect(pdfBytes.equals(state.bytes.pdf)).toBe(true);
  expect((await PDFDocument.load(pdfBytes)).getPageCount()).toBe(1);
  await page.getByRole('button', { name: 'Prepare ZIP', exact: true }).click();
  const zipDownload = await downloadFrom(page, 'Download ZIP');
  expect(zipDownload.suggestedFilename()).toBe('cards-print-zip.zip');
  const archive = await JSZip.loadAsync(await downloadBytes(zipDownload));
  expect(Object.keys(archive.files).sort()).toEqual([
    'README.txt',
    'cards.csv',
    'cards.pdf',
    'print-context.json',
  ]);
  expect(await archive.file('cards.csv')!.async('string')).toBe(PRINT_CSV);
  expect(JSON.parse(await archive.file('print-context.json')!.async('string'))).toEqual(
    PRINT_CONTEXT,
  );
  expect((await archive.file('cards.pdf')!.async('nodebuffer')).equals(state.bytes.pdf)).toBe(true);
  expect(
    state.prints.map((body) => ({ shortCodes: body.shortCodes, format: body.format })),
  ).toEqual([
    { shortCodes: PRINT_CODES, format: 'pdf' },
    { shortCodes: PRINT_CODES, format: 'pdf' },
    { shortCodes: PRINT_CODES, format: 'zip' },
  ]);
  expect(state.prints[2]!.idempotencyKey).not.toBe(state.prints[1]!.idempotencyKey);
}

for (const viewport of viewports) {
  test(`prepare exact card batches, retry uncertain writes and download PDF/ZIP (${viewport.label})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const state = stockPrintState(await printPayloads(), { faults: true });
    await installStockPrintUi(page, state);
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/cards`);
    await prepareBatch(page, state);
    await verifyPrintDownloads(page, state);
    await expect(page.getByRole('button', { name: 'View export print-zip' })).toBeVisible();
    expect(state.downloads).toEqual(['print-pdf', 'print-pdf', 'print-zip']);
    expect(state.unexpected).toEqual([]);
  });
  test(`reload stored print history and page older archive files without generation authority (${viewport.label})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const state = stockPrintState(await printPayloads(), { history: true });
    await installStockPrintUi(page, state, {
      phase: 'ARCHIVED',
      actions: ['Self.Read', 'Report.Export'],
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/cards`);
    await expect(page.getByRole('button', { name: 'Generate card batch' })).toHaveCount(0);
    await page.getByRole('button', { name: 'View export print-pdf' }).click();
    await expect(page.getByText('Printed codes: ABC123, DEF456')).toBeVisible();
    await expect(page.getByText('Frozen event name: Frozen Mock Event')).toBeVisible();
    await expect(page.getByText('Stamping stations: Frozen stamping room')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'View export print-pdf' })).toBeVisible();
    await expect(page.getByText('Stored export details', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Load older print exports' }).click();
    await page.getByRole('button', { name: 'View export print-zip' }).click();
    await expect(page.getByText('This older export has no saved print context.')).toBeVisible();
    const file = await downloadFrom(page, 'Download stored ZIP');
    expect((await downloadBytes(file)).equals(state.bytes.zip)).toBe(true);
    expect(state.historyReads.filter((cursor) => cursor === 'first').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(state.historyReads).toContain('print-pdf');
    expect(state.detailReads).toEqual(['print-pdf', 'print-zip']);
    expect(state.generation).toEqual([]);
    expect(state.prints).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
  test(`hide print history and prevent storage reads without export permission (${viewport.label})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const state = stockPrintState(await printPayloads(), { history: true });
    await installStockPrintUi(page, state, { actions: ['Self.Read'] });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/cards`);
    await expect(page.getByRole('heading', { name: 'Look up or correct a card' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Previous print exports' })).toHaveCount(0);
    expect(state.historyReads).toEqual([]);
    expect(state.detailReads).toEqual([]);
    expect(state.downloads).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
  test(`create and edit gift types, then retry a reasoned stock correction without double counting (${viewport.label})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const state = stockPrintState(await printPayloads(), { faults: true });
    await installStockPrintUi(page, state);
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/gifts`);
    const add = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Add a gift', exact: true }) });
    await add.getByLabel('Gift name').fill('New Tote');
    await add.getByLabel('Opening stock').fill('30');
    await add.getByLabel('Low-stock threshold').fill('10');
    await add.getByRole('button', { name: 'Add gift type' }).click();
    await expect(page.getByRole('heading', { name: 'New Tote', exact: true })).toBeVisible();
    const gift = page.getByRole('heading', { name: 'Existing Badge', exact: true }).locator('..');
    await expect(gift.getByText('14 remaining · 8 redeemed · Active')).toBeVisible();
    await expect(gift.getByText('Low stock: arrange another delivery.')).toBeVisible();
    await gift.getByLabel('Gift name').fill('Badge corrected');
    await gift.getByLabel('Low-stock threshold').fill('4');
    await gift.getByLabel('Active at the gift desk').uncheck();
    await gift.getByRole('button', { name: 'Save gift type' }).click();
    const edited = page
      .getByRole('heading', { name: 'Badge corrected', exact: true })
      .locator('..');
    await expect(edited.getByText('14 remaining · 8 redeemed · Inactive')).toBeVisible();
    await expect(edited.getByText('Low stock: arrange another delivery.')).toHaveCount(0);
    await edited.getByLabel('Stock change').fill('5');
    await edited.getByRole('button', { name: 'Record stock change' }).click();
    expect(state.adjustments).toEqual([]);
    await edited.getByLabel('Reason for stock change').fill('Verified delivery of five badges');
    await edited.getByRole('button', { name: 'Record stock change' }).click();
    await expect(
      edited.getByText(
        'Stock was not confirmed. Retry the same change to check its result safely.',
      ),
    ).toBeVisible();
    await edited.getByRole('button', { name: 'Record stock change' }).click();
    await expect(edited.getByText('Stock change recorded.')).toBeVisible();
    await expect(edited.getByText('19 remaining · 8 redeemed · Inactive')).toBeVisible();
    expect(state.adjustments).toHaveLength(2);
    expect(state.adjustments[0]!.idempotencyKey).toBe(state.adjustments[1]!.idempotencyKey);
    expect(state.gifts[0]).toMatchObject({
      initialStock: 20,
      redeemed: 8,
      adjustment: 7,
      remaining: 19,
      active: false,
    });
    expect(state.creates).toHaveLength(1);
    expect(state.updates).toHaveLength(1);
    expect(state.catalogueReads).toBeGreaterThan(1);
    expect(state.unexpected).toEqual([]);
  });
}
