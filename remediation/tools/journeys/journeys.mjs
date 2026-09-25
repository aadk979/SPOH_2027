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
];
