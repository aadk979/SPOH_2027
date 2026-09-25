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
];
