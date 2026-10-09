import { ACTION_CATALOGUE, ACTION_IDS } from '@spoh/access-policies';
import type { MyPermissionsResponse } from '@spoh/shared';
import type { Request, Response } from 'express';
import { askEach, type Check } from '../../../platform/http/authorize.js';
import { settingCheck } from '../../../platform/http/authorizeResources.js';
import { getAuth } from '../../../platform/http/requireAuth.js';

/** Event-wide actions a member may take: those the schema applies to the event itself. */
const EVENT_ACTIONS = ACTION_IDS.filter((action) => {
  const { principalTypes, resourceTypes } = ACTION_CATALOGUE[action];
  return (
    (principalTypes as readonly string[]).includes('Membership') &&
    (resourceTypes as readonly string[]).includes('Event')
  );
});

/** One setting of each class stands for its class: the action depends only on the class. */
const SETTING_CLASSES = {
  operational: 'attendance.campusNetworkLabel',
  security: 'attendance.campusCidrs',
  privacy: 'lostPersonPurgeHours',
} as const;

export async function myPermissionsHandler(req: Request, res: Response): Promise<void> {
  const event = { type: 'Event' as const, id: getAuth(req).eventId };
  const classes = Object.entries(SETTING_CLASSES) as [keyof typeof SETTING_CLASSES, string][];
  const checks: Check[] = [
    ...EVENT_ACTIONS.map((action) => ({ action, resource: event })),
    ...classes.map(([, key]) => settingCheck(key)),
  ];
  const results = await askEach(req, checks);
  const allowed = (index: number) => results[index]?.allowed === true;
  const body: MyPermissionsResponse = {
    actions: Object.fromEntries(EVENT_ACTIONS.map((action, index) => [action, allowed(index)])),
    settings: {
      operational: allowed(EVENT_ACTIONS.length),
      security: allowed(EVENT_ACTIONS.length + 1),
      privacy: allowed(EVENT_ACTIONS.length + 2),
    },
  };
  res.set('Cache-Control', 'no-store');
  res.status(200).json(body);
}
