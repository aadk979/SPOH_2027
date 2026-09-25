/**
 * Journey definitions for P02. Each journey is one role walking named steps.
 *
 * A step is `{ name, path?, act?(page), settleMs? }`: `path` is loaded fresh,
 * `act` drives the page (clicks, typing, going offline) before the screenshot.
 * `freeze` pins the client clock inside a shift block (see lib.mjs).
 */

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
];
