import type { Priority } from './priority';

export type ComposerValues = {
  body: string;
  priority: Priority;
  requiresAck: boolean;
  eventWide: boolean;
  stationId: string;
};

export const EMPTY_COMPOSER: ComposerValues = {
  body: '',
  priority: 'OPERATIONAL',
  requiresAck: false,
  eventWide: false,
  stationId: '',
};

/** Target errors belong to the station picker, the only editable part of the target. */
export const COMPOSER_ERROR_FIELDS = { target: 'stationId' } as const;

/** The request body before schema validation; an unset station falls back to the sender's own. */
export function toAnnouncementRequest(values: ComposerValues, ownStationId: string | null) {
  return {
    body: values.body.trim(),
    priority: values.priority,
    requiresAck: values.requiresAck,
    target: values.eventWide ? {} : { stationId: values.stationId || ownStationId },
  };
}
