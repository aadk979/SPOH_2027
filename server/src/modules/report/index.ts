/** The report module's public API: the only file another module may import. */
export { reportRouter } from './http/routes.js';
export { generateReportInTransaction } from './application/generateReport.js';
