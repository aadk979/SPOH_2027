import { systemClock, type Clock } from '../../../platform/time/index.js';
import { deleteOwnSubscription, upsertSubscription } from '../data/repo.js';

/** Register a device, or refresh it and hand it to whoever now holds it. */
export async function subscribeDevice(
  input: {
    volunteerId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
  },
  clock: Clock = systemClock,
): Promise<{ id: string }> {
  return upsertSubscription(input, clock.now());
}

/** Scoped to the caller's own subscriptions: you may only unsubscribe yourself. */
export async function unsubscribeDevice(volunteerId: string, endpoint: string): Promise<boolean> {
  return (await deleteOwnSubscription(volunteerId, endpoint)) > 0;
}
