import { authorize } from '../../../platform/http/authorize.js';
import { theEvent } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import {
  ArchiveExportParams,
  CreateArchiveExportRequest,
  ReportExportQuery,
  ReportQuery,
  ReportSnapshotExportQuery,
  ReportSnapshotParams,
  ReportSnapshotReadQuery,
  ReportSnapshotsQuery,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import {
  createArchiveExportHandler,
  listArchiveExportsHandler,
  readArchiveExportHandler,
} from './archiveHandlers.js';
import { sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { exportReportHandler, reportSummaryHandler } from './handlers.js';
import {
  exportSnapshotHandler,
  listSnapshotsHandler,
  readSnapshotHandler,
} from './snapshotHandlers.js';

/** Post-event reporting (BUILD_PLAN §7.2). */
export const reportRouter: Router = Router();

reportRouter.use(requireAuth);
reportRouter.get(
  '/archive-exports',
  sensitiveRateLimit,
  authorize('Report.Export', theEvent),
  listArchiveExportsHandler,
);
reportRouter.post(
  '/archive-export',
  sensitiveRateLimit,
  authorize('Report.Export', theEvent),
  validate({ body: CreateArchiveExportRequest }),
  idempotent('POST /reports/archive-export'),
  createArchiveExportHandler,
);
reportRouter.get(
  '/archive-export/:id',
  sensitiveRateLimit,
  authorize('Report.Export', theEvent),
  validate({ params: ArchiveExportParams }),
  readArchiveExportHandler,
);

reportRouter.get(
  '/snapshots',
  sensitiveRateLimit,
  authorize('Report.Generate', theEvent),
  validate({ query: ReportSnapshotsQuery }),
  listSnapshotsHandler,
);
reportRouter.get(
  '/snapshots/:id',
  sensitiveRateLimit,
  authorize('Report.Generate', theEvent),
  validate({ params: ReportSnapshotParams, query: ReportSnapshotReadQuery }),
  readSnapshotHandler,
);
reportRouter.get(
  '/snapshots/:id/export',
  sensitiveRateLimit,
  authorize('Report.Export', theEvent),
  validate({ params: ReportSnapshotParams, query: ReportSnapshotExportQuery }),
  exportSnapshotHandler,
);

/**
 * The whole dataset in one payload. Rate limited as a sensitive endpoint: it is
 * the most expensive query in the system and nobody needs it more than a few
 * times a minute.
 */
reportRouter.get(
  '/summary',
  sensitiveRateLimit,
  authorize('Report.Generate', theEvent),
  validate({ query: ReportQuery }),
  reportSummaryHandler,
);

/**
 * The file the Lead (Comms & Outreach) actually wants. The filename carries the
 * date so a folder of these stays sortable.
 */
reportRouter.get(
  '/export',
  sensitiveRateLimit,
  authorize('Report.Export', theEvent),
  validate({ query: ReportExportQuery }),
  exportReportHandler,
);
