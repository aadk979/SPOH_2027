/* eslint-disable no-console -- journey steps print evidence to the runner's stdout */
/**
 * Journey definitions for P02. Each journey is one role walking named steps.
 *
 * A step is `{ name, path?, act?(page), settleMs? }`: `path` is loaded fresh,
 * `act` drives the page (clicks, typing, going offline) before the screenshot.
 * `freeze` pins the client clock inside a shift block (see lib.mjs).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STATE_DIR, paceSignIn } from './lib.mjs';

const submit = (page) => page.locator('main button[type=submit]').first().click();
const settle = (page, ms = 800) => page.waitForTimeout(ms);

const ROLE = {
  admin: 'admin@spoh2027.test',
  lead: 'lead@spoh2027.test',
  chief: 'chief@spoh2027.test',
  deputy: 'dc@spoh2027.test',
  ic: 'ic@spoh2027.test',
  booth: 'booth@spoh2027.test',
  counter: 'counter@spoh2027.test',
};

export const journeys = [
  {
    id: 'smoke',
    title: 'Harness check: sign-in page, then Admin home',
    role: ROLE.admin,
    freeze: 'MORNING',
    steps: [
      { name: 'home', path: '/home' },
      { name: 'shift', path: '/shift' },
    ],
  },
  {
    id: 'admin-setup',
    title: 'Journey 1 (P02.2): Admin sets up "Test Event 2027" from nothing',
    role: ROLE.admin,
    steps: [
      { name: 'home', path: '/home' },
      { name: 'operations hub', path: '/operations' },
      { name: 'volunteers list', path: '/admin/users' },
      {
        name: 'imported test volunteers',
        path: '/admin/users',
        act: async (page) => {
          await page.getByLabel('Name or email').fill('te-vol');
          await page.waitForTimeout(800);
        },
      },
      {
        name: 'manage a volunteer',
        act: async (page) => {
          await page.getByRole('button', { name: 'Manage' }).first().click();
        },
      },
      { name: 'event settings', path: '/admin/settings' },
      {
        name: 'rename the event',
        path: '/admin/settings',
        act: async (page) => {
          await page.getByLabel('Event name').fill('Test Event 2027');
          await page.getByRole('button', { name: 'Save settings' }).click();
          await page.waitForTimeout(800);
        },
      },
      { name: 'home after the rename', path: '/home' },
      { name: 'my shift after the rename', path: '/shift' },
      {
        name: 'restore the event name',
        path: '/admin/settings',
        act: async (page) => {
          await page.getByLabel('Event name').fill('SPOH 2027');
          await page.getByRole('button', { name: 'Save settings' }).click();
          await page.waitForTimeout(800);
        },
      },
      { name: 'guess: /admin', path: '/admin' },
      { name: 'guess: /admin/stations', path: '/admin/stations' },
      { name: 'guess: /admin/event-days', path: '/admin/event-days' },
      { name: 'guess: /admin/gifts', path: '/admin/gifts' },
      { name: 'live operations with both events', path: '/chief' },
      { name: 'reports', path: '/reports' },
    ],
  },
  {
    id: 'chief-day',
    title: 'Journey 2 (P02.3): event day as Chief',
    role: ROLE.chief,
    freeze: 'MORNING',
    steps: [
      { name: 'home', path: '/home' },
      { name: 'operations hub', path: '/operations' },
      { name: 'live dashboard', path: '/chief' },
      {
        name: 'try to drill into a silent station',
        path: '/chief',
        act: async (page) => {
          await page
            .getByText(/has recorded nothing/)
            .first()
            .click({ timeout: 3000 });
        },
      },
      { name: 'IC console as the drill-down', path: '/ic' },
      {
        name: 'compose an urgent announcement',
        path: '/inbox',
        act: async (page) => {
          await page
            .getByLabel('Message')
            .fill('Lift B is out of service. Send visitors to Lift A.');
          await page.getByText('Urgent', { exact: false }).first().click();
        },
      },
      {
        name: 'send it',
        act: async (page) => {
          await page.getByRole('button', { name: 'Send', exact: true }).click();
          await page.waitForTimeout(800);
        },
      },
      {
        name: 'declare fallback',
        path: '/chief/fallback',
        act: async (page) => {
          await page.getByLabel('What has happened?').fill('Wi-Fi down on level 5');
          await page.getByRole('button', { name: /^Declare Tier/ }).click();
          await page.waitForTimeout(800);
        },
      },
      {
        name: 'close fallback',
        path: '/chief/fallback',
        act: async (page) => {
          await page
            .getByRole('button', { name: /^Close the Tier/ })
            .first()
            .click();
          await page.waitForTimeout(800);
        },
      },
      {
        name: 'import fallback data: preview',
        path: '/chief/imports',
        act: async (page) => {
          await page.getByRole('button', { name: 'Insert the template' }).click();
          await page.getByRole('button', { name: /^Preview/ }).click();
          await page.waitForTimeout(800);
        },
      },
      {
        name: 'import fallback data: commit',
        act: async (page) => {
          await page.getByRole('button', { name: /^Import \d+ record/ }).click();
          await page.waitForTimeout(800);
        },
      },
      { name: 'dashboard after fallback and import', path: '/chief' },
      { name: 'guess: roster gaps', path: '/roster' },
      { name: 'report', path: '/reports' },
      { name: 'TV mode', path: '/tv', settleMs: 1500 },
    ],
  },
  {
    id: 'deputy-day',
    title: 'Journey 2 (P02.3): event day as Deputy',
    role: ROLE.deputy,
    freeze: 'MORNING',
    steps: [
      { name: 'home', path: '/home' },
      { name: 'operations hub', path: '/operations' },
      { name: 'live dashboard', path: '/chief' },
      { name: 'IC console', path: '/ic' },
      { name: 'announcements', path: '/inbox' },
      { name: 'fallback', path: '/chief/fallback' },
      { name: 'imports', path: '/chief/imports' },
      { name: 'volunteers', path: '/admin/users' },
      { name: 'report', path: '/reports' },
      { name: 'TV mode', path: '/tv', settleMs: 1500 },
    ],
  },
  {
    id: 'ic-shift',
    title: 'Journey 3 (P02.4): IC shift (run fixtures.mjs first)',
    role: ROLE.ic,
    freeze: 'MORNING',
    steps: [
      { name: 'home with an active lost-person alert', path: '/home' },
      { name: 'operations hub', path: '/operations' },
      { name: 'IC console', path: '/ic' },
      {
        name: 'IC console: Sign-Up Booth',
        act: async (page) => {
          await page.getByLabel('Station').selectOption({ label: 'Sign-Up Booth' });
          await page.waitForTimeout(1000);
        },
      },
      {
        name: 'approve the swap',
        act: async (page) => {
          await page
            .getByRole('button', { name: /^Approve the swap/ })
            .first()
            .click();
          await page.waitForTimeout(800);
        },
      },
      {
        name: 'acknowledge the lost-person alert',
        path: '/home',
        act: async (page) => {
          await page
            .getByRole('button', { name: /^Acknowledge/ })
            .first()
            .click();
          await page.waitForTimeout(800);
        },
      },
      {
        name: 'resolve the lost-person alert',
        act: async (page) => {
          await page
            .getByRole('button', { name: /^Found/ })
            .first()
            .click();
          await page.waitForTimeout(800);
        },
      },
      { name: 'safety hub: where are incidents?', path: '/safety' },
      { name: 'guess: /safety/incident', path: '/safety/incident' },
      { name: 'attendance: issue codes', path: '/attendance' },
      { name: 'guess: void a registration from capture', path: '/capture/registration' },
      { name: 'guess: gift stock', path: '/capture/redeem' },
      { name: 'my shift', path: '/shift' },
    ],
  },
  {
    id: 'volunteer-first',
    title: 'Journey 4 (P02.5): a volunteer signs in for the first time',
    role: null,
    freeze: 'MORNING',
    steps: [
      { name: 'landing, signed out', path: '/' },
      { name: 'sign-in', path: '/sign-in' },
      {
        name: 'sign in as a new volunteer',
        act: async (page) => {
          await paceSignIn();
          await page.getByLabel('Roster email').fill('te-vol-2@spoh2027.test');
          await page.getByRole('button', { name: 'Sign in' }).click();
          await page.waitForURL('**/home');
        },
      },
      { name: 'my shift', path: '/shift' },
      { name: 'redeem at Mission Complete', path: '/capture/redeem' },
      {
        name: 'redeem: enter a card',
        act: async (page) => {
          await page.getByRole('button', { name: /Mission Complete Badge/ }).click();
          await page.getByPlaceholder('Card code').fill('3WNE72');
        },
      },
    ],
  },
  {
    id: 'volunteer-booth',
    title: 'Journey 4 (P02.5): booth volunteer shift (run fixtures.mjs volunteer first)',
    role: ROLE.booth,
    freeze: 'MORNING',
    steps: [
      { name: 'home', path: '/home' },
      { name: 'my shift', path: '/shift' },
      { name: 'attendance', path: '/attendance' },
      {
        name: 'attendance by PIN',
        act: async (page) => {
          const { pin } = JSON.parse(readFileSync(path.join(STATE_DIR, 'pin.json'), 'utf8'));
          await page.getByLabel('Secondary verification PIN').fill(pin);
          await page.getByRole('button', { name: 'Submit attendance with PIN' }).click();
          await settle(page, 1500);
        },
      },
      {
        name: 'register a visitor',
        path: '/capture/registration',
        act: async (page) => {
          await page
            .getByRole('button', { name: /^Sec 4/ })
            .first()
            .click();
          await settle(page, 300);
        },
      },
      {
        name: 'undo it',
        act: async (page) => {
          await page.getByRole('button', { name: /Undo/ }).first().click();
          await settle(page);
        },
      },
      { name: 'a family arriving together', path: '/capture/registration/group' },
      {
        name: 'offline: three taps queue',
        path: '/capture/registration',
        act: async (page) => {
          await page.context().setOffline(true);
          for (let i = 0; i < 3; i += 1) {
            await page
              .getByRole('button', { name: /^Sec 3/ })
              .first()
              .click();
            await settle(page, 300);
          }
          await settle(page, 3000);
        },
      },
      {
        name: 'back online: queue drains',
        act: async (page) => {
          await page.context().setOffline(false);
          await settle(page, 5000);
        },
      },
      {
        name: 'a tap the server refuses',
        path: '/capture/registration',
        act: async (page) => {
          await page.route('**/api/v1/registrations', (route) =>
            route.fulfill({
              status: 422,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'VALIDATION_FAILED', message: 'Refused by the journey harness' },
              }),
            }),
          );
          await page
            .getByRole('button', { name: /^Sec 1/ })
            .first()
            .click();
          await settle(page, 4000);
        },
      },
      {
        name: 'salvage on my shift',
        path: '/shift',
        act: async (page) => {
          await page.unrouteAll();
        },
      },
      {
        name: 'raise a lost person',
        path: '/safety/lost-person/new',
        act: async (page) => {
          await page
            .getByLabel('What has happened, and who are we looking for?')
            .fill('Girl, ponytail, looking for her brother near the booth');
          await page.getByLabel('Approximate age').fill('about 10');
          await submit(page);
          await settle(page, 1500);
        },
      },
      {
        name: 'report an incident',
        path: '/safety/incident/new',
        act: async (page) => {
          await page.getByText('Near miss', { exact: false }).first().click();
          await page
            .getByLabel('What happened?')
            .fill('Stack of chairs nearly fell on a visitor by the queue barrier.');
          await submit(page);
          await settle(page, 1500);
        },
      },
      {
        name: 'log a found item',
        path: '/safety/lost-found/new',
        act: async (page) => {
          await page.getByLabel('What is it?').fill('Blue water bottle with stickers');
          await page.getByLabel('Where is it being kept?').fill('Sign-Up Booth drawer');
          await submit(page);
          await settle(page, 1500);
        },
      },
      { name: 'lost and found list', path: '/safety/lost-found' },
      { name: 'inbox', path: '/inbox' },
      { name: 'guide', path: '/guide' },
      { name: 'map', path: '/map' },
      { name: 'visitor journey', path: '/journey' },
      { name: 'brief', path: '/brief' },
    ],
  },
  {
    id: 'volunteer-counter',
    title: 'Journey 4 (P02.5): counter and stamp volunteer at DCDF Station',
    role: ROLE.counter,
    freeze: 'MORNING',
    steps: [
      { name: 'home', path: '/home' },
      {
        name: 'count an entry',
        path: '/capture/footfall',
        act: async (page) => {
          await page.getByRole('button', { name: /^Count one entry/ }).click();
          await settle(page, 300);
        },
      },
      {
        name: 'stamp a card by code',
        path: '/capture/stamp',
        act: async (page) => {
          await page.getByPlaceholder('Card code').fill('3WNE71');
          await submit(page);
          await settle(page, 1500);
        },
      },
      { name: 'guess: registration from a course station', path: '/capture/registration' },
    ],
  },
  {
    id: 'lead',
    title: 'Journey 5 (P02.6): Lead reads reports, the roster and the audit trail',
    role: ROLE.lead,
    steps: [
      { name: 'home', path: '/home' },
      { name: 'operations hub', path: '/operations' },
      { name: 'live dashboard', path: '/chief' },
      { name: 'IC console', path: '/ic' },
      { name: 'report', path: '/reports' },
      {
        name: 'export CSV',
        path: '/reports',
        act: async (page) => {
          const response = page.waitForResponse(/\/reports\/export/, { timeout: 20_000 });
          await page.getByRole('button', { name: 'Download CSV' }).click();
          const res = await response;
          // The page reads the body as a blob, so Playwright cannot report its size.
          console.log(`     export ${res.status()} ${res.headers()['content-disposition'] ?? ''}`);
          await settle(page, 1000);
        },
      },
      { name: 'volunteers (read-only)', path: '/admin/users' },
      { name: 'guess: audit log', path: '/audit' },
      { name: 'guess: /admin/audit', path: '/admin/audit' },
      { name: 'event settings by URL', path: '/admin/settings' },
      { name: 'fallback by URL', path: '/chief/fallback' },
      { name: 'safety hub', path: '/safety' },
      { name: 'log a found item by URL', path: '/safety/lost-found/new' },
      { name: 'announcements', path: '/inbox' },
      { name: 'my shift', path: '/shift' },
    ],
  },
  {
    id: 'after-event',
    title: 'Journey 6 (P02.7): after the event, and the next one (Chief)',
    role: ROLE.chief,
    steps: [
      { name: 'lost and found: still held', path: '/safety/lost-found' },
      {
        name: 'lost and found: every item',
        path: '/safety/lost-found',
        act: async (page) => {
          await page.getByLabel('Only items still held').uncheck();
          await settle(page);
        },
      },
      { name: 'final report', path: '/reports' },
      {
        name: 'deactivate one volunteer',
        path: '/admin/users',
        act: async (page) => {
          await page.getByLabel('Name or email').fill('te-vol-20');
          await settle(page);
          await page.getByRole('button', { name: 'Manage' }).first().click();
          await page.getByLabel('Reason').fill('Event over');
          await page.getByRole('button', { name: /^Deactivate/ }).click();
          await settle(page, 1200);
        },
      },
      {
        name: 'roster including deactivated',
        path: '/admin/users',
        act: async (page) => {
          await page.getByLabel('Include deactivated').check();
          await settle(page);
        },
      },
      { name: 'operations: no archive, no new event', path: '/operations' },
      { name: 'settings: nothing event-scoped', path: '/admin/settings' },
    ],
  },
  {
    id: 'denied-lead',
    title: 'P02.9: what a Lead sees when the server says no',
    role: ROLE.lead,
    steps: [
      {
        name: 'declare fallback',
        path: '/chief/fallback',
        act: async (page) => {
          await page.getByLabel('What has happened?').fill('Testing a denial');
          await page.getByRole('button', { name: /^Declare Tier/ }).click();
          await settle(page, 1200);
        },
      },
      {
        name: 'log a found item',
        path: '/safety/lost-found/new',
        act: async (page) => {
          await page.getByLabel('What is it?').fill('Umbrella');
          await submit(page);
          await settle(page, 1200);
        },
      },
    ],
  },
  {
    id: 'denied-deputy',
    title: 'P02.9: what a Deputy sees when the server says no',
    role: ROLE.deputy,
    steps: [
      {
        name: 'preview a fallback import',
        path: '/chief/imports',
        act: async (page) => {
          await page.getByRole('button', { name: 'Insert the template' }).click();
          await page.getByRole('button', { name: /^Preview/ }).click();
          await settle(page, 1200);
        },
      },
    ],
  },
  {
    id: 'denied-volunteer',
    title: 'P02.9: committee screens opened by a volunteer',
    role: ROLE.booth,
    steps: [
      { name: 'operations hub', path: '/operations' },
      { name: 'live dashboard', path: '/chief' },
      { name: 'IC console', path: '/ic' },
      { name: 'volunteers', path: '/admin/users' },
      { name: 'reports', path: '/reports' },
      { name: 'fallback', path: '/chief/fallback' },
      { name: 'TV', path: '/tv' },
    ],
  },
];
