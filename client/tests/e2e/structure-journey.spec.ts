import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import {
  CreateCaptureCategoryRequest,
  CreateManagedTemplateRequest,
  CreateStationRequest,
  CreateStationTagRequest,
  CreateStationTypeRequest,
  RemoveEventDayRequest,
  StructureResponse,
  UpdateCaptureCategoryRequest,
  UpdateManagedTemplateRequest,
  UpdateShiftExceptionRequest,
  UpdateStationTagRequest,
  UpdateStationTypeRequest,
  type Action,
  type EventDayRecord,
  type ManagedShiftTemplate,
  type ShiftExceptionRecord,
  type StationSummary,
} from '@spoh/shared';
import { mockIdentityUi, IDENTITY_EVENT } from './identityUiFixture';
import { STRUCTURE, STRUCTURE_DAY, STRUCTURE_STATION } from '../helpers/structure';

const envelope = (data: unknown[]) => ({ data, meta: { count: data.length, nextCursor: null } });
function fixture() {
  return {
    data: { ...structuredClone(STRUCTURE), eventId: IDENTITY_EVENT.id },
    days: [structuredClone(STRUCTURE_DAY)],
    stations: [structuredClone(STRUCTURE_STATION)],
  };
}
type Fixture = ReturnType<typeof fixture>;
async function mockStructureUi(
  page: Page,
  state: Fixture,
  options: {
    actions?: Action[];
    write?(route: Route, path: string): Promise<boolean>;
  } = {},
) {
  await mockIdentityUi(page, {
    actions: options.actions ?? [
      'Self.Read',
      'Structure.Read',
      'Structure.Edit',
      'Structure.Change',
    ],
    handle: async (route, path) => {
      if (route.request().method() !== 'GET') {
        if (!path.includes('/admin/')) return false;
        if (await options.write?.(route, path)) return true;
        return false;
      }
      if (path.endsWith('/admin/structure')) {
        await route.fulfill({ json: StructureResponse.parse({ data: state.data }) });
        return true;
      }
      if (path.endsWith('/admin/stations')) {
        await route.fulfill({ json: envelope(state.stations) });
        return true;
      }
      if (path.endsWith('/admin/event-days')) {
        await route.fulfill({ json: envelope(state.days) });
        return true;
      }
      return false;
    },
  });
}
function section(page: Page, title: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: title, exact: true, level: 2 }) });
}
function row(collection: Locator, label: string) {
  return collection
    .locator('details')
    .filter({
      has: collection.locator('summary strong').filter({ hasText: new RegExp(`^${label}$`) }),
    });
}
async function openRow(collection: Locator, label: string) {
  const detail = row(collection, label);
  await detail.locator('summary').click();
  return detail;
}
function windowFor(
  day: EventDayRecord,
  hours: Pick<ManagedShiftTemplate, 'startLocal' | 'endLocal' | 'endsNextDay'>,
) {
  const startsAt = new Date(`${day.date}T${hours.startLocal}:00+08:00`).toISOString();
  const end = new Date(`${day.date}T${hours.endLocal}:00+08:00`);
  if (hours.endsNextDay) end.setUTCDate(end.getUTCDate() + 1);
  return {
    startsAt,
    endsAt: end.toISOString(),
    startLocal: hours.startLocal,
    endLocal: hours.endLocal,
    endsNextDay: hours.endsNextDay,
  };
}
function addTemplate(state: Fixture, template: ManagedShiftTemplate) {
  state.data.templates.push(template);
  for (const day of state.days) {
    const shift = {
      id: `${day.id}-${template.id}`,
      eventDayId: day.id,
      date: day.date,
      dayLabel: day.label,
      templateId: template.id,
      overridden: false,
      ...windowFor(day, template),
    };
    state.data.shifts.push(shift);
    day.shifts.push({
      id: shift.id,
      code: template.code,
      label: template.label,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    });
  }
}
function followTemplate(state: Fixture, template: ManagedShiftTemplate) {
  for (const shift of state.data.shifts.filter(
    (item) => item.templateId === template.id && !item.overridden,
  )) {
    const day = state.days.find((item) => item.id === shift.eventDayId)!;
    Object.assign(shift, windowFor(day, template));
    Object.assign(
      day.shifts.find((item) => item.id === shift.id)!,
      { startsAt: shift.startsAt, endsAt: shift.endsAt, label: template.label },
    );
  }
}
async function scopedWrite(route: Route, path: string) {
  expect(path).toContain(`/events/${IDENTITY_EVENT.id}/`);
  expect(route.request().headers()['authorization']).toContain('Bearer ');
}

for (const width of [390, 1440]) {
  test(`configure station capabilities and tags, then use them on a new station (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = fixture();
    const writes: string[] = [];
    await mockStructureUi(page, state, {
      write: async (route, path) => {
        await scopedWrite(route, path);
        if (path.endsWith('/structure/types')) {
          const { idempotencyKey: _key, ...body } = CreateStationTypeRequest.parse(
            route.request().postDataJSON(),
          );
          expect(body).toMatchObject({
            code: 'WELCOME',
            registersVisitors: true,
            countsEntry: false,
          });
          const data = { id: 'welcome-type', ...body, active: true };
          state.data.stationTypes.push(data);
          writes.push('create-type');
          await route.fulfill({ status: 201, json: { data } });
        } else if (path.endsWith('/structure/types/welcome-type')) {
          const { idempotencyKey: _key, ...body } = UpdateStationTypeRequest.parse(
            route.request().postDataJSON(),
          );
          const data = state.data.stationTypes.find((item) => item.id === 'welcome-type')!;
          Object.assign(data, body);
          writes.push('edit-type');
          await route.fulfill({ json: { data } });
        } else if (path.endsWith('/structure/tags')) {
          const { idempotencyKey: _key, ...body } = CreateStationTagRequest.parse(
            route.request().postDataJSON(),
          );
          expect(body.description).toBe('Visitor arrival points');
          const data = { id: 'welcome-tag', ...body, active: true };
          state.data.stationTags.push(data);
          writes.push('create-tag');
          await route.fulfill({ status: 201, json: { data } });
        } else if (path.endsWith('/structure/tags/welcome-tag')) {
          const { idempotencyKey: _key, ...body } = UpdateStationTagRequest.parse(
            route.request().postDataJSON(),
          );
          const data = state.data.stationTags.find((item) => item.id === 'welcome-tag')!;
          Object.assign(data, body);
          writes.push('edit-tag');
          await route.fulfill({ json: { data } });
        } else if (path.endsWith('/admin/stations')) {
          const body = CreateStationRequest.parse(route.request().postDataJSON());
          expect(body).toMatchObject({
            code: 'WELCOME_ONE',
            typeCode: 'WELCOME',
            tagCodes: ['ARRIVAL'],
            floor: 'Ground floor',
          });
          const type = state.data.stationTypes.find((item) => item.code === body.typeCode)!;
          const { active: _active, sortOrder: _sortOrder, ...capabilities } = type;
          const station: StationSummary = {
            id: 'welcome-station',
            code: body.code,
            name: body.name,
            floor: body.floor ?? null,
            sortOrder: body.sortOrder,
            active: true,
            type: capabilities,
            tags: state.data.stationTags
              .filter((item) => body.tagCodes.includes(item.code))
              .map(({ id, code, label }) => ({ id, code, label })),
          };
          state.stations.push(station);
          writes.push('create-station');
          await route.fulfill({ status: 201, json: { station } });
        } else return false;
        return true;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/stations`);
    const types = section(page, 'Station types');
    await types.getByText('Add station types', { exact: true }).click();
    const typeForm = types.locator('details').first();
    await typeForm.getByLabel('Type code').fill('WELCOME');
    await typeForm.getByLabel('Type label').fill('Welcome desk');
    await typeForm.getByLabel('Registers visitors').check();
    await typeForm.getByRole('button', { name: 'Create type' }).click();
    const typeRecord = await openRow(types, 'Welcome desk');
    await expect(typeRecord.getByLabel('Type code')).toBeDisabled();
    await typeRecord.getByLabel('Counts room entries').check();
    await typeRecord.getByRole('button', { name: 'Save type' }).click();
    await expect(typeRecord.getByRole('status')).toContainText('Saved.');
    const tags = section(page, 'Station tags');
    await tags.getByText('Add station tags', { exact: true }).click();
    const tagForm = tags.locator('details').first();
    await tagForm.getByLabel('Tag code').fill('ARRIVAL');
    await tagForm.getByLabel('Tag label').fill('Arrival');
    await tagForm.getByLabel('Tag description').fill('Visitor arrival points');
    await tagForm.getByRole('button', { name: 'Create tag' }).click();
    const arrival = await openRow(tags, 'Arrival');
    await expect(arrival.getByLabel('Tag code')).toBeDisabled();
    await arrival.getByLabel('Tag description').fill('Arrival and registration');
    await arrival.getByRole('button', { name: 'Save tag' }).click();
    await expect(arrival.getByRole('status')).toContainText('Saved.');
    const stations = section(page, 'Stations');
    await stations.getByText('Add stations', { exact: true }).click();
    const stationForm = stations.locator('details').first();
    await stationForm.getByLabel('Station code').fill('WELCOME_ONE');
    await stationForm.getByLabel('Station name').fill('Main welcome desk');
    await stationForm.getByLabel('Station type').selectOption('WELCOME');
    await stationForm.getByLabel('Arrival', { exact: true }).check();
    await stationForm.getByLabel('Floor or location').fill('Ground floor');
    await stationForm.getByRole('button', { name: 'Create station' }).click();
    await expect(row(stations, 'Main welcome desk').locator('summary')).toContainText(
      'Welcome desk',
    );
    await page.reload();
    const saved = await openRow(section(page, 'Stations'), 'Main welcome desk');
    await expect(saved.getByLabel('Station code')).toHaveValue('WELCOME_ONE');
    await expect(saved.getByLabel('Station type')).toHaveValue('WELCOME');
    await expect(saved.getByLabel('Arrival', { exact: true })).toBeChecked();
    expect(writes).toEqual([
      'create-type',
      'edit-type',
      'create-tag',
      'edit-tag',
      'create-station',
    ]);
  });

  test(`add, reorder and retire a visitor category while keeping its stable code (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = fixture();
    const writes: string[] = [];
    await mockStructureUi(page, state, {
      write: async (route, path) => {
        await scopedWrite(route, path);
        if (path.endsWith('/structure/categories')) {
          const { idempotencyKey: _key, ...body } = CreateCaptureCategoryRequest.parse(
            route.request().postDataJSON(),
          );
          const data = {
            id: 'alumni-category',
            ...body,
            active: true,
            updatedAt: '2027-01-02T00:00:00.000Z',
          };
          state.data.categories.push(data);
          writes.push('create');
          await route.fulfill({ status: 201, json: { data } });
        } else if (path.endsWith('/structure/categories/alumni-category')) {
          const { idempotencyKey: _key, ...body } = UpdateCaptureCategoryRequest.parse(
            route.request().postDataJSON(),
          );
          expect(body).toMatchObject({ label: 'Former students', sortOrder: 2, active: false });
          const data = state.data.categories.find((item) => item.id === 'alumni-category')!;
          Object.assign(data, body);
          state.data.categories.sort((a, b) => a.sortOrder - b.sortOrder);
          writes.push('retire');
          await route.fulfill({ json: { data } });
        } else return false;
        return true;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/categories`);
    const categories = section(page, 'Visitor categories');
    await categories.getByText('Add visitor categories', { exact: true }).click();
    const add = categories.locator('details').first();
    await add.getByLabel('Category code').fill('ALUMNI');
    await add.getByLabel('Category label').fill('Alumni');
    await add.getByLabel('Display order').fill('20');
    await add.getByRole('button', { name: 'Create category' }).click();
    const alumni = await openRow(categories, 'Alumni');
    await expect(alumni.getByLabel('Category code')).toBeDisabled();
    await alumni.getByLabel('Category label').fill('Former students');
    await alumni.getByLabel('Display order').fill('2');
    await alumni.getByLabel('Active category').uncheck();
    await alumni.getByRole('button', { name: 'Save category' }).click();
    await expect(row(categories, 'Former students').locator('summary')).toContainText(
      'ALUMNI · order 2 · inactive',
    );
    await page.reload();
    const retired = await openRow(section(page, 'Visitor categories'), 'Former students');
    await expect(retired.getByLabel('Category code')).toHaveValue('ALUMNI');
    await expect(retired.getByLabel('Display order')).toHaveValue('2');
    await expect(retired.getByLabel('Active category')).not.toBeChecked();
    expect(state.data.categories.map((category) => category.code)).toEqual(['GUEST', 'ALUMNI']);
    expect(writes).toEqual(['create', 'retire']);
  });

  test(`create a template, preserve a day exception through edits, restore it, and remove an unused day (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = fixture();
    const operations: string[] = [];
    await mockStructureUi(page, state, {
      write: async (route, path) => {
        await scopedWrite(route, path);
        if (path.endsWith('/structure/templates')) {
          const { idempotencyKey: _key, ...body } = CreateManagedTemplateRequest.parse(
            route.request().postDataJSON(),
          );
          const data = { id: 'evening-template', ...body, active: true };
          addTemplate(state, data);
          operations.push('create-template');
          await route.fulfill({ status: 201, json: { data } });
        } else if (path.endsWith('/structure/templates/template')) {
          const { idempotencyKey: _key, ...body } = UpdateManagedTemplateRequest.parse(
            route.request().postDataJSON(),
          );
          const data = state.data.templates.find((item) => item.id === 'template')!;
          Object.assign(data, body);
          followTemplate(state, data);
          operations.push('edit-template');
          await route.fulfill({ json: { data } });
        } else if (path.endsWith('/structure/shifts/shift')) {
          const body = UpdateShiftExceptionRequest.parse(route.request().postDataJSON());
          const data: ShiftExceptionRecord = state.data.shifts.find((item) => item.id === 'shift')!;
          const hours =
            body.operation === 'override'
              ? body
              : state.data.templates.find((item) => item.id === data.templateId)!;
          Object.assign(data, windowFor(state.days[0]!, hours), {
            overridden: body.operation === 'override',
          });
          operations.push(body.operation);
          await route.fulfill({ json: { data } });
        } else if (path.endsWith('/structure/days/day')) {
          expect(route.request().method()).toBe('DELETE');
          RemoveEventDayRequest.parse(route.request().postDataJSON());
          state.days = [];
          state.data.shifts = [];
          operations.push('remove-day');
          await route.fulfill({ json: { removed: true } });
        } else return false;
        return true;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/days`);
    const templates = section(page, 'Shift templates');
    await templates.getByText('Add shift templates', { exact: true }).click();
    const add = templates.locator('details').first();
    await add.getByLabel('Template code').fill('EVENING');
    await add.getByLabel('Shift label').fill('Evening shift');
    await add.getByLabel('Start time').fill('17:00');
    await add.getByLabel('End time').fill('20:00');
    await add.getByRole('button', { name: 'Create template' }).click();
    await expect(page.getByRole('columnheader', { name: 'Evening shift' })).toBeVisible();
    const dayTemplate = await openRow(templates, 'Day shift');
    await dayTemplate.getByLabel('Start time').fill('10:00');
    await dayTemplate.getByLabel('End time').fill('14:00');
    await dayTemplate.getByRole('button', { name: 'Save template' }).click();
    const grid = section(page, 'Day × shift exceptions');
    const firstCell = grid.getByRole('cell').first();
    await expect(firstCell.locator('summary')).toContainText('10:00–14:00');
    await firstCell.locator('summary').click();
    await firstCell.getByLabel('Exception start time').fill('11:00');
    await firstCell.getByLabel('Exception end time').fill('12:00');
    await firstCell.getByRole('button', { name: 'Save exception' }).click();
    await expect(firstCell.locator('summary')).toContainText('11:00–12:00');
    await expect(firstCell.getByText('Exception', { exact: true })).toBeVisible();
    await dayTemplate.getByLabel('Start time').fill('10:30');
    await dayTemplate.getByLabel('End time').fill('14:30');
    await dayTemplate.getByRole('button', { name: 'Save template' }).click();
    await expect(dayTemplate.getByRole('status')).toContainText('Saved.');
    await expect(firstCell.locator('summary')).toContainText('11:00–12:00');
    await firstCell.getByRole('button', { name: 'Follow template again' }).click();
    await expect(firstCell.locator('summary')).toContainText('10:30–14:30');
    await expect(firstCell.getByText('Follows template', { exact: true })).toBeVisible();
    const day = await openRow(section(page, 'Event days'), 'Event day');
    await expect(day.getByLabel('Event date')).toBeDisabled();
    await expect(day.getByRole('button', { name: 'Remove unused day' })).toBeDisabled();
    await day.getByLabel('Remove Event day (2027-01-07) and its empty shifts').check();
    await day.getByRole('button', { name: 'Remove unused day' }).click();
    await expect(page.getByText('No event days yet', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Add days and active templates to see the exceptions grid'),
    ).toBeVisible();
    expect(operations).toEqual([
      'create-template',
      'edit-template',
      'override',
      'edit-template',
      'restore',
      'remove-day',
    ]);
  });

  test(`retain a used day when removal is refused and keep the same receipt on retry (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = fixture();
    const receipts: string[] = [];
    await mockStructureUi(page, state, {
      write: async (route, path) => {
        if (!path.endsWith('/structure/days/day')) return false;
        await scopedWrite(route, path);
        expect(route.request().method()).toBe('DELETE');
        receipts.push(RemoveEventDayRequest.parse(route.request().postDataJSON()).idempotencyKey);
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'CONFLICT',
              message: 'This event already has captured records. Keep the day for its history.',
              requestId: 'synthetic-day-refusal',
            },
          },
        });
        return true;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/days`);
    const day = await openRow(section(page, 'Event days'), 'Event day');
    await day.getByLabel('Remove Event day (2027-01-07) and its empty shifts').check();
    await day.getByRole('button', { name: 'Remove unused day' }).click();
    await expect(day.getByRole('alert')).toContainText('Keep the day for its history.');
    await day.getByRole('button', { name: 'Remove unused day' }).click();
    await expect.poll(() => receipts.length).toBe(2);
    expect(receipts[0]).toBe(receipts[1]);
    expect(state.days).toHaveLength(1);
    await expect(day.locator('summary')).toContainText('2027-01-07');
  });

  test(`show structure without creation or mutation controls to a reader (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = fixture();
    let writes = 0;
    await mockStructureUi(page, state, {
      actions: ['Self.Read', 'Structure.Read'],
      write: async () => {
        writes++;
        return false;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/stations`);
    const type = await openRow(section(page, 'Station types'), 'Room');
    await expect(type.getByLabel('Type label')).toBeDisabled();
    await expect(type.getByLabel('Registers visitors')).toBeDisabled();
    await expect(type.getByRole('button', { name: 'Save type' })).toBeDisabled();
    await expect(page.getByText('Add station types', { exact: true })).toHaveCount(0);
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/categories`);
    const category = await openRow(section(page, 'Visitor categories'), 'Guests');
    await expect(category.getByLabel('Category label')).toBeDisabled();
    await expect(category.getByLabel('Active category')).toBeDisabled();
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/days`);
    const template = await openRow(section(page, 'Shift templates'), 'Day shift');
    await expect(template.getByLabel('Start time')).toBeDisabled();
    await expect(template.getByRole('button', { name: 'Save template' })).toBeDisabled();
    const grid = section(page, 'Day × shift exceptions');
    await grid.getByRole('cell').first().locator('summary').click();
    await expect(grid.getByRole('button', { name: 'Save exception' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove unused day' })).toHaveCount(0);
    expect(writes).toBe(0);
  });
}
