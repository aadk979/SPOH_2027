import { expect, test } from '@playwright/test';
import {
  CreateAssignmentRequest,
  CreateBriefingSlotRequest,
  CreateSwapRequest,
  DecideSwapRequest,
  RosterImportRequest,
} from '@spoh/shared';
import { mockIdentityUi, IDENTITY_EVENT, IDENTITY_PERSON } from './identityUiFixture';
import {
  MY_STAFFING_ASSIGNMENT,
  STAFFING_ASSIGNMENT,
  STAFFING_BRIEFING,
  STAFFING_DAY,
  STAFFING_PERSON,
  STAFFING_STATION,
  STAFFING_SWAP,
} from '../helpers/staffing';

const envelope = (data: unknown[]) => ({ data, meta: { count: data.length, nextCursor: null } });
for (const width of [390, 1440]) {
  test(`staff an empty day, import a reviewed plan, schedule and complete a briefing (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let assigned = false;
    let scheduled = false;
    let completed = false;
    const imports: boolean[] = [];
    await mockIdentityUi(page, {
      actions: ['Self.Read', 'Roster.Edit', 'People.Read', 'People.Update', 'Briefing.Complete'],
      handle: async (route, path) => {
        if (path.endsWith('/admin/event-days')) {
          await route.fulfill({ json: envelope([STAFFING_DAY]) });
          return true;
        }
        if (path.endsWith('/stations')) {
          await route.fulfill({ json: envelope([STAFFING_STATION]) });
          return true;
        }
        if (path.endsWith('/admin/volunteers')) {
          await route.fulfill({ json: envelope([STAFFING_PERSON]) });
          return true;
        }
        if (path.includes('/roster/station/')) {
          await route.fulfill({ json: envelope(assigned ? [STAFFING_ASSIGNMENT] : []) });
          return true;
        }
        if (path.endsWith('/admin/assignments')) {
          expect(CreateAssignmentRequest.parse(route.request().postDataJSON())).toMatchObject({
            volunteerId: 'person',
            shiftId: 'shift',
            stationId: 'station',
          });
          assigned = true;
          await route.fulfill({ json: { assignment: STAFFING_ASSIGNMENT } });
          return true;
        }
        if (path.endsWith('/roster/import')) {
          const input = RosterImportRequest.parse(route.request().postDataJSON());
          expect(input.rows).toMatchObject([
            { stationCode: 'ROOM', eventDate: STAFFING_DAY.date, shift: 'MORNING' },
          ]);
          imports.push(input.commit);
          await route.fulfill({
            json: {
              committed: input.commit,
              volunteersCreated: 0,
              volunteersUpdated: 1,
              assignmentsCreated: 0,
              assignmentsUpdated: 1,
              issues: [],
            },
          });
          return true;
        }
        if (path.endsWith('/roster/briefing-slots')) {
          if (route.request().method() === 'POST') {
            expect(CreateBriefingSlotRequest.parse(route.request().postDataJSON())).toMatchObject({
              eventDayId: 'day',
              briefierId: 'person',
              startsAt: '2027-01-08T01:30:00.000Z',
            });
            scheduled = true;
            await route.fulfill({ status: 201, json: { data: { id: 'briefing' } } });
          } else
            await route.fulfill({
              json: envelope(
                scheduled
                  ? [
                      {
                        ...STAFFING_BRIEFING,
                        completedAt: completed ? '2027-01-08T01:35:00.000Z' : null,
                      },
                    ]
                  : [],
              ),
            });
          return true;
        }
        if (path.endsWith('/briefing-slots/briefing/complete')) {
          completed = true;
          await route.fulfill({
            json: { slot: { ...STAFFING_BRIEFING, completedAt: '2027-01-08T01:35:00.000Z' } },
          });
          return true;
        }
        return false;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/admin/staffing`);
    await expect(page.getByText('1 unstaffed station shifts of 1.')).toBeVisible();
    await page.getByText('Assign to Room', { exact: true }).click();
    await page.getByLabel('Assign person').selectOption('person');
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(page.getByText('0 unstaffed station shifts of 1.')).toBeVisible();
    await page
      .getByLabel('Roster CSV')
      .fill(
        `displayName,email,stationCode,eventDate,shift\nSample Person,sample@example.test,ROOM,${STAFFING_DAY.date},MORNING`,
      );
    await page.getByRole('button', { name: 'Preview import' }).click();
    await expect(page.getByRole('button', { name: 'Apply reviewed import' })).toBeVisible();
    expect(imports).toEqual([false]);
    await page.getByRole('button', { name: 'Apply reviewed import' }).click();
    await expect(page.getByText(/Applied: 0 people added, 1 updated/)).toBeVisible();
    expect(imports).toEqual([false, true]);
    await page.getByRole('link', { name: 'Briefing schedule', exact: true }).click();
    await page.getByLabel('Briefing time', { exact: false }).fill('09:30');
    await page.getByLabel('Briefer', { exact: true }).selectOption('person');
    await page.getByRole('button', { name: 'Schedule briefing' }).click();
    await page
      .getByLabel('Completion notes', { exact: false })
      .fill('All required points covered.');
    await page.getByRole('button', { name: 'Mark briefing complete' }).click();
    await expect(page.getByRole('button', { name: 'Mark briefing complete' })).toHaveCount(0);
    expect(completed).toBe(true);
  });

  test(`request a volunteer swap and review it as the IC (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let requested = false;
    let decided = false;
    await mockIdentityUi(page, {
      actions: ['Self.Read', 'Swap.Request', 'Swap.Decide'],
      handle: async (route, path) => {
        if (path.endsWith('/me')) {
          await route.fulfill({
            json: {
              volunteer: IDENTITY_PERSON,
              event: IDENTITY_EVENT,
              upcomingAssignments: [MY_STAFFING_ASSIGNMENT],
              currentAssignment: null,
              escalationChain: [],
            },
          });
          return true;
        }
        if (path.endsWith('/swap-targets')) {
          await route.fulfill({ json: envelope([{ id: 'target', displayName: 'Target Person' }]) });
          return true;
        }
        if (path.endsWith('/roster/swaps')) {
          if (route.request().method() === 'POST') {
            expect(CreateSwapRequest.parse(route.request().postDataJSON())).toMatchObject({
              assignmentId: 'assignment',
              targetVolunteerId: 'target',
            });
            requested = true;
            await route.fulfill({ status: 201, json: { swap: STAFFING_SWAP } });
          } else
            await route.fulfill({
              json: envelope(
                requested ? [{ ...STAFFING_SWAP, status: decided ? 'APPROVED' : 'REQUESTED' }] : [],
              ),
            });
          return true;
        }
        if (path.endsWith('/swaps/pending')) {
          await route.fulfill({ json: envelope(requested && !decided ? [STAFFING_SWAP] : []) });
          return true;
        }
        if (path.endsWith('/swaps/swap/decide')) {
          expect(DecideSwapRequest.parse(route.request().postDataJSON())).toMatchObject({
            decision: 'APPROVED',
          });
          decided = true;
          await route.fulfill({ json: { swap: { ...STAFFING_SWAP, status: 'APPROVED' } } });
          return true;
        }
        return false;
      },
    });
    await page.goto(`/e/${IDENTITY_EVENT.slug}/swaps`);
    await page.getByLabel('Shift to give away').selectOption('assignment');
    await page.getByLabel('Person taking the shift').selectOption('target');
    await page.getByLabel('Swap reason', { exact: false }).fill('Exam timetable');
    await page.getByRole('button', { name: 'Request swap' }).click();
    await page.getByRole('button', { name: 'Save decision' }).click();
    await expect(page.getByText('No swaps await review.')).toBeVisible();
    await expect(page.getByText(/Target Person · APPROVED/)).toBeVisible();
    expect(decided).toBe(true);
  });
}
