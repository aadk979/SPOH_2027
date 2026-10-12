import { z } from 'zod';
import { IsoDateTime } from '../common/index.js';

export const UpdateNoticePreferenceRequest = z.object({
  urgentPush: z.boolean(), operationalPush: z.boolean(),
}).strict();
export type UpdateNoticePreferenceRequest = z.infer<typeof UpdateNoticePreferenceRequest>;
export const NoticePreferenceRecord = UpdateNoticePreferenceRequest.extend({
  updatedAt: IsoDateTime.nullable(),
}).strict();
export type NoticePreferenceRecord = z.infer<typeof NoticePreferenceRecord>;
export const DEFAULT_NOTICE_PREFERENCE: NoticePreferenceRecord = Object.freeze({
  urgentPush: true, operationalPush: false, updatedAt: null,
});
