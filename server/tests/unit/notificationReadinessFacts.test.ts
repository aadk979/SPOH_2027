import { expect, it } from 'vitest';
import { notificationReadinessFacts } from '../../src/modules/event/application/notificationReadinessFacts.js';

it('proves the configured polling contract without requiring optional push credentials', () => {
  expect(notificationReadinessFacts([])).toEqual({
    transportConfigured: true,
    settingsValid: true,
  });
  expect(notificationReadinessFacts([{ key: 'alertPollSeconds', value: 20 }])).toEqual({
    transportConfigured: true,
    settingsValid: true,
  });
});
it.each([
  { rows: [{ key: 'alertPollSeconds', value: 0 }] },
  { rows: [{ key: 'push.ttlSeconds.incident', value: '900' }] },
  { rows: [{ key: 'incident.pushSeverities', value: ['INVALID'] }] },
])('reports malformed stored notification policy as a known configuration failure', ({ rows }) => {
  expect(notificationReadinessFacts(rows)).toEqual({
    transportConfigured: false,
    settingsValid: false,
  });
});
it.each(
  [
    null,
    {},
    [{ key: 'private-key', value: 'redacted' }],
    [
      { key: 'alertPollSeconds', value: 10 },
      { key: 'alertPollSeconds', value: 10 },
    ],
  ].map((rows) => ({ rows })),
)('never makes incoherent evidence available', ({ rows }) => {
  expect(notificationReadinessFacts(rows)).toBeUndefined();
});
