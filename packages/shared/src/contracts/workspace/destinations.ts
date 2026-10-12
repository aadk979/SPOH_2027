import { z } from 'zod';
import { Id } from '../common/index.js';
import { EntityRef } from './entities.js';
import { RecordsFilter } from './records.js';

export const WorkspaceActionPath = z.enum(['/home', '/shift', '/attendance', '/swaps', '/briefings',
  '/counts', '/reports', '/chief', '/ic', '/inbox', '/guide', '/map', '/help',
  '/safety/incidents', '/safety/incident/new', '/safety/lost-person/new',
  '/safety/lost-found', '/safety/lost-found/new', '/chief/fallback', '/chief/imports',
  '/admin/staffing', '/admin/corrections', '/admin/cards', '/admin/gifts', '/admin/days',
  '/admin/stations', '/admin/categories', '/admin/audit', '/admin/content', '/admin/close-out',
  '/admin/users', '/admin/users/person', '/admin/settings', '/admin/permissions', '/admin/schedule',
  '/capture/registration', '/capture/registration/group', '/capture/footfall', '/capture/stamp', '/capture/redeem']);
export const WorkspaceDestination = z.discriminatedUnion('type', [
  z.object({ type: z.literal('entity'), target: EntityRef }).strict(),
  z.object({ type: z.literal('records'), filter: RecordsFilter }).strict(),
  z.object({ type: z.literal('action'), path: WorkspaceActionPath,
    query: z.object({ id: Id.optional(), stationId: Id.optional(), personId: Id.optional(),
      eventDayId: Id.optional(), shiftId: Id.optional(), cardId: Id.optional() }).strict().optional() }).strict(),
  z.object({ type: z.literal('platform'), path: z.literal('/events'), eventId: Id }).strict(),
]);
export type WorkspaceDestination = z.infer<typeof WorkspaceDestination>;
export const WorkspaceLink = z.object({ label: z.string().min(1).max(160), destination: WorkspaceDestination }).strict();
export type WorkspaceLink = z.infer<typeof WorkspaceLink>;
