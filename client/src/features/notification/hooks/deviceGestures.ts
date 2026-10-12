import { getSession, getSessionGeneration } from '@/shared/lib/session';
import { registerPush } from '../api';
import { toPushRequest } from '../pushSync';

function decodeKey(base64Url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = window.atob((base64Url + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return buffer;
}
export function deviceOwnerFence() {
  const generation = getSessionGeneration();
  const personId = getSession()?.volunteerId;
  return { personId, current: () => generation === getSessionGeneration() && personId === getSession()?.volunteerId };
}

/** Every browser/provider boundary rechecks the owner who made the explicit gesture. */
export async function subscribeCurrentDevice(input: { publicKey: string; current: () => boolean }) {
  const permission = await Notification.requestPermission();
  if (!input.current()) return { state: 'STALE' as const };
  if (permission !== 'granted') return { state: 'DENIED' as const };
  const registration = await navigator.serviceWorker.ready;
  if (!input.current()) return { state: 'STALE' as const };
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true,
    applicationServerKey: decodeKey(input.publicKey) });
  if (!input.current()) return { state: 'STALE' as const };
  await registerPush(toPushRequest(subscription));
  return input.current() ? { state: 'SUBSCRIBED' as const, endpoint: subscription.endpoint }
    : { state: 'STALE' as const };
}
