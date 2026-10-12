import type { Priority } from './priority';

export type ComposerValues = {
  body: string;
  priority: Priority;
  requiresAck: boolean;
  audienceIntent: 'EVENT' | 'TARGETED';
  stationId: string;
};

export const EMPTY_COMPOSER: ComposerValues = {
  body: '',
  priority: 'OPERATIONAL',
  requiresAck: false,
  audienceIntent: 'TARGETED',
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
    target: values.audienceIntent === 'EVENT' ? {} : { stationId: values.stationId || ownStationId || '' },
  };
}
