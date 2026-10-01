import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * Lost person (PRODUCT_BRIEF §7.3) — the highest-value single feature here, and
 * the only place the system holds a description of a human being.
 *
 * The record is TRANSIENT: it exists to coordinate a search, and once resolved
 * and past the retention window it is reduced to an anonymised summary. And
 * calling still beats tapping: the reporter's phone number rides with the
 * alert for exactly that reason.
 */

export function assertAlertActive(alert: { status: string }): void {
  if (alert.status !== 'ACTIVE') {
    throw new AppError(
      409,
      ERROR_CODES.ALERT_ALREADY_RESOLVED,
      'This alert has already been resolved',
    );
  }
}

/** Resolved before this instant, an alert's description is due for the purge. */
export function purgeCutoff(now: Date, purgeHours: number): Date {
  return new Date(now.getTime() - purgeHours * 60 * 60 * 1000);
}

/**
 * The push that fans out a new alert. It carries no description, clothing or
 * age: those are what the purge exists to destroy after 24 hours, and a push
 * is copied into the operating system's notification history, where nothing we
 * do afterwards can reach it. The notification says a child is missing; the
 * app says who.
 */
export function raisedPush(alert: { id: string; rehearsal: boolean }) {
  return {
    kind: 'lostPerson.raised' as const,
    priority: 'URGENT' as const,
    title: alert.rehearsal
      ? 'REHEARSAL · Lost person practice alert'
      : 'Lost person — check your app now',
    body: alert.rehearsal
      ? 'Practice exercise. Open the ops app to rehearse the response.'
      : 'A lost person alert is active. Open the ops app for the description.',
    url: '/home',
    tag: `lost-person:${alert.id}`,
    audience: { everyone: true, volunteerIds: [] as string[] },
  };
}

/**
 * The stand-down, as important as the alert: volunteers still searching for a
 * child who has been found are not doing their job, and the next real alert
 * lands on people who learned the last one never ended. Same tag as the raise,
 * so it replaces that notification rather than stacking under it.
 */
export function resolvedPush(alert: { id: string; rehearsal: boolean }) {
  return {
    kind: 'lostPerson.resolved' as const,
    priority: 'OPERATIONAL' as const,
    title: alert.rehearsal ? 'REHEARSAL · Practice alert resolved' : 'Lost person resolved',
    body: alert.rehearsal
      ? 'The practice alert has been closed. The exercise is complete.'
      : 'The alert has been closed. Thank you — stand down.',
    url: '/home',
    tag: `lost-person:${alert.id}`,
    audience: { everyone: true, volunteerIds: [] as string[] },
  };
}
