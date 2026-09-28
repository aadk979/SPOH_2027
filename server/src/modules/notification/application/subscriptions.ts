import { systemClock, type Clock } from '../../../platform/time/index.js';
import { deleteOwnSubscription, pruneDevicesBeyond, upsertSubscription } from '../data/repo.js';
import { MAX_DEVICES_PER_PERSON } from '../domain/delivery.js';

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
  const subscription = await upsertSubscription(input, clock.now());
  // Capped per person: the newest devices stay, the least recently seen go (F04-025).
  await pruneDevicesBeyond(input.volunteerId, MAX_DEVICES_PER_PERSON);
  return subscription;
}

/** Scoped to the caller's own subscriptions: you may only unsubscribe yourself. */
export async function unsubscribeDevice(volunteerId: string, endpoint: string): Promise<boolean> {
  return (await deleteOwnSubscription(volunteerId, endpoint)) > 0;
}
