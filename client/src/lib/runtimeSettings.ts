'use client';

import { useSyncExternalStore } from 'react';
import type { RuntimeSettings, SettingsResponse, ShiftBlockWindows } from '@spoh/shared';
import { api } from './api';

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
 * mirror `DEFAULT_SETTINGS` on the server — the two are checked against each
 * other by `client/tests/settings.test.ts`.
 */
export interface ClientSettings {
  dashboardPollSeconds: number;
  alertPollSeconds: number;
  captureUndoWindowSeconds: number;
  captureSendGraceSeconds: number;
  outboxWarningCount: number;
  outboxWarningAgeMinutes: number;
  silentStationMinutes: number;
  staleDeviceMinutes: number;
  eventName: string;
  /** The configured shift hours, which the shift labels print (F01-046). */
  shiftBlocks: ShiftBlockWindows;
}

export const DEFAULT_CLIENT_SETTINGS: Readonly<ClientSettings> = Object.freeze({
  dashboardPollSeconds: 3,
  alertPollSeconds: 10,
  captureUndoWindowSeconds: 10,
  captureSendGraceSeconds: 2,
  outboxWarningCount: 20,
  outboxWarningAgeMinutes: 5,
  silentStationMinutes: 15,
  staleDeviceMinutes: 15,
  eventName: 'SPOH 2027',
  shiftBlocks: {
    MORNING: { start: '09:30', end: '14:00' },
    AFTERNOON: { start: '13:30', end: '18:00' },
  },
});

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

/**
 * Fetch once per page load.
 *
 * Deliberately total: any failure leaves the defaults in place. A volunteer
 * whose settings request failed should get an app that behaves normally, not
 * one that refuses to start because it could not read a poll interval.
 */
export async function loadClientSettings(): Promise<void> {
  if (loaded) return;
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
      shiftBlocks: settings.shiftBlocks,
    });

    for (const listener of listeners) listener();
  } catch {
    // Defaults stand. Nothing to tell the volunteer — they cannot act on it.
    loaded = false;
  }
}
