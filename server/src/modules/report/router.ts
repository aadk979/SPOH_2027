import { Router, type Request, type Response } from 'express';
import { ReportExportQuery, ReportQuery } from '@spoh/shared';
import { requireAuth } from '../../middleware/auth/index.js';
import { sensitiveRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import { validate, validatedQuery } from '../../middleware/validate.js';
import { toCsv, toXlsx } from './export.js';
import { generateReport } from './service.js';

/** Post-event reporting (BUILD_PLAN §7.2). */
export const reportRouter: Router = Router();

reportRouter.use(requireAuth);

/**
 * The whole dataset in one payload. Rate limited as a sensitive endpoint: it is
 * the most expensive query in the system and nobody needs it more than a few
 * times a minute.
 */
reportRouter.get(
  '/summary',
  sensitiveRateLimit,
  requireCapability('report.generate'),
  validate({ query: ReportQuery }),
  async (req: Request, res: Response) => {
    res.status(200).json(await generateReport(validatedQuery<ReportQuery>(req)));
  },
);

/**
 * The file the Lead (Comms & Outreach) actually wants. The filename carries the
 * date so a folder of these stays sortable.
 */
reportRouter.get(
  '/export',
  sensitiveRateLimit,
  requireCapability('report.generate'),
  validate({ query: ReportExportQuery }),
  async (req: Request, res: Response) => {
    const query = validatedQuery<ReportExportQuery>(req);
    const report = await generateReport(query);
    const stamp = report.generatedAt.slice(0, 10);

    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="spoh2027-report-${stamp}.csv"`);
      res.status(200).send(toCsv(report));
      return;
    }

    const workbook = await toXlsx(report);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="spoh2027-report-${stamp}.xlsx"`);
    res.status(200).send(workbook);
  },
);
