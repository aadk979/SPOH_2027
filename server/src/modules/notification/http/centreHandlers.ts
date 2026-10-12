import type { Request, Response } from 'express';
import type { ListNoticesQuery, UpdateNoticePreferenceRequest } from '@spoh/shared';
import { getPerson } from '../../../platform/http/requireAuth.js';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import type { NoticeSourceReaders } from '../../../platform/notification/sourceReader.js';
import type { Clock } from '../../../platform/time/index.js';
import { readNoticeCentre, readNoticeDetail, type NoticeHistoryMaterialiser } from '../application/readCentre.js';
import { markNoticeRead } from '../application/markNoticeRead.js';
import { readNoticePreference, updateNoticePreference } from '../application/noticePreferences.js';

export interface CentreDependencies { sourceReaders: NoticeSourceReaders; clock?: Clock;
  materialiseHistory?: NoticeHistoryMaterialiser }

export function createCentreHandlers(input: CentreDependencies) {
  const reader = (req: Request) => ({ ...input, personId: getPerson(req).personId });
  return {
    preference: async (req: Request, res: Response) => {
      res.json(await readNoticePreference(getPerson(req).personId));
    },
    savePreference: async (req: Request, res: Response) => {
      res.json(await updateNoticePreference(validatedBody<UpdateNoticePreferenceRequest>(req), {
        ...reader(req), audit: auditContextFrom(req) }));
    },
    list: async (req: Request, res: Response) => {
      res.json(await readNoticeCentre(validatedQuery<ListNoticesQuery>(req), reader(req)));
    },
    detail: async (req: Request, res: Response) => {
      res.json(await readNoticeDetail(validatedParams<{ id: string }>(req).id, reader(req)));
    },
    markRead: async (req: Request, res: Response) => {
      res.json(await markNoticeRead(validatedParams<{ id: string }>(req).id, {
        ...reader(req), audit: auditContextFrom(req) }));
    },
  };
}
