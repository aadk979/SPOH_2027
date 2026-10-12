import { Router } from 'express';
import { z } from 'zod';
import { Id, ListNoticesQuery, NoticeReadRequest, PushSubscriptionRequest, UpdateNoticePreferenceRequest } from '@spoh/shared';
import { requirePerson } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { createCentreHandlers, type CentreDependencies } from './centreHandlers.js';
import { personDeviceHandlers } from './personDeviceHandlers.js';
import { pushConfigHandler } from './handlers.js';

const params = z.object({ id: Id }).strict();
export function createPersonNotificationRouter(input: CentreDependencies): Router {
  const router = Router();
  router.use(requirePerson, defaultRateLimit, (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store'); next();
  });
  const handlers = createCentreHandlers(input);
  const devices = personDeviceHandlers(input.clock);
  router.get('/device/config', pushConfigHandler);
  router.post('/device/subscriptions', validate({ body: PushSubscriptionRequest }), devices.subscribe);
  router.delete('/device/subscriptions', validate({ body: z.object({ endpoint: z.url().max(2048) }).strict() }),
    devices.unsubscribe);
  router.get('/preferences', handlers.preference);
  router.put('/preferences', validate({ body: UpdateNoticePreferenceRequest }), handlers.savePreference);
  router.get('/', validate({ query: ListNoticesQuery }), handlers.list);
  router.get('/:id', validate({ params }), handlers.detail);
  router.put('/:id/read', validate({ params, body: NoticeReadRequest }), handlers.markRead);
  return router;
}
