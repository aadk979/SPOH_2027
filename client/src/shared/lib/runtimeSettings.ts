'use client';

import { useSyncExternalStore } from 'react';
import {
  GENERATED_SETTING_DEFAULTS,
  type GeneratedSettingValues,
  type RuntimeSettings,
  type SettingsResponse,
} from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { getSession, subscribeToSession } from '@/shared/lib/session';

/**
 * The client's copy of the runtime settings.
 *
 * The poll intervals, the undo window, the send grace period and the outbox
 * warning thresholds were hard-coded on both sides of the wire, which meant
 * changing one required changing two files and shipping both. Worse, they could
 * silently disagree: a server that considers a station silent after ten minutes
 * and a client that says fifteen are describing different events.
 *
 * They are fetched once at boot and cached in memory. Every reader has a
 * compiled default, so nothing waits on the request and a server that cannot be
 * reached simply behaves the way it always did.
 */

/**
 * Compiled defaults. These are the values the client shipped with, and they
 * come from the server registry's generated contracts.
 */
const CLIENT_KEYS = [
  'dashboardPollSeconds',
  'alertPollSeconds',
  'captureUndoWindowSeconds',
  'captureSendGraceSeconds',
  'outboxWarningCount',
  'outboxWarningAgeMinutes',
  'silentStationMinutes',
  'staleDeviceMinutes',
  'eventName',
] as const satisfies readonly (keyof GeneratedSettingValues)[];
export type ClientSettings = Pick<GeneratedSettingValues, (typeof CLIENT_KEYS)[number]>;

export const DEFAULT_CLIENT_SETTINGS: Readonly<ClientSettings> = Object.freeze(
  Object.fromEntries(
    CLIENT_KEYS.map((key) => [key, GENERATED_SETTING_DEFAULTS[key]]),
  ) as ClientSettings,
);

let cache: Readonly<ClientSettings> = DEFAULT_CLIENT_SETTINGS;

const listeners = new Set<() => void>();

export function getClientSettings(): Readonly<ClientSettings> {
  return cache;
}

export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The settings for a component that must re-render when they arrive. */
export function useClientSettings(): Readonly<ClientSettings> {
  return useSyncExternalStore(
    subscribeToSettings,
    getClientSettings,
    () => DEFAULT_CLIENT_SETTINGS,
  );
}

/** Milliseconds, for the many places that want a timer rather than a number. */
export const ms = {
  dashboardPoll: (): number => cache.dashboardPollSeconds * 1000,
  alertPoll: (): number => cache.alertPollSeconds * 1000,
  undoWindow: (): number => cache.captureUndoWindowSeconds * 1000,
  sendGrace: (): number => cache.captureSendGraceSeconds * 1000,
  outboxWarningAge: (): number => cache.outboxWarningAgeMinutes * 60_000,
};

let loaded = false;
let stopWaiting: (() => void) | null = null;

/**
 * A signed-out page load has nothing to read with. The sign-in that follows is
 * client-side navigation, so nothing reloads: the settings load when the
 * session appears instead (F03-032).
 */
function loadOnceSignedIn(): void {
  stopWaiting ??= subscribeToSession(() => {
    if (!getSession()) return;
    stopWaiting?.();
    stopWaiting = null;
    void loadClientSettings();
  });
}

/**
 * Fetch once per page load, as soon as there is a session to fetch with.
 *
 * Deliberately total: any failure leaves the defaults in place. A volunteer
 * whose settings request failed should get an app that behaves normally, not
 * one that refuses to start because it could not read a poll interval.
 */
export async function loadClientSettings(): Promise<void> {
  // Every role may read the settings, but only signed in: a signed-out request
  // is a guaranteed 401 in the server log (F02-010).
  if (loaded) return;
  if (!getSession()) {
    loadOnceSignedIn();
    return;
  }
  loaded = true;

  try {
    const response = await api<SettingsResponse>('/admin/settings');
    const settings: RuntimeSettings = response.settings;

    cache = Object.freeze({
      dashboardPollSeconds: settings.dashboardPollSeconds,
      alertPollSeconds: settings.alertPollSeconds,
      captureUndoWindowSeconds: settings.captureUndoWindowSeconds,
      captureSendGraceSeconds: settings.captureSendGraceSeconds,
      outboxWarningCount: settings.outboxWarningCount,
      outboxWarningAgeMinutes: settings.outboxWarningAgeMinutes,
      silentStationMinutes: settings.silentStationMinutes,
      staleDeviceMinutes: settings.staleDeviceMinutes,
      eventName: settings.eventName,
    });

    for (const listener of listeners) listener();
  } catch {
    // Defaults stand. Nothing to tell the volunteer — they cannot act on it.
    loaded = false;
  }
}
