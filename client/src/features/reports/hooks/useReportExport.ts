import { useState } from 'react';
import { zonedDate, type FullReport } from '@spoh/shared';
import { useEvent } from '@/shared/lib/eventContext';
import { exportReport } from '../api';
export function useReportExport(
  includeRehearsal = false,
  options: { current?: boolean; snapshot?: FullReport['snapshot'] } = {},
) {
  const event = useEvent();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  /**
   * Fetched with the bearer token and saved from a blob rather than linked.
   * A plain anchor cannot carry the Authorization header, and putting the token
   * in a query string would write a credential into every access log between
   * here and the server.
   */
  async function download(format: 'xlsx' | 'csv'): Promise<void> {
    setDownloading(format);
    setExportError(null);

    try {
      const blob = await exportReport(event.id, format, {
        includeRehearsal,
        current: options.current,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      // Named for the event and dated on its clock, not in UTC (F01 T-16).
      const date = options.snapshot ? new Date(options.snapshot.createdAt) : new Date();
      const today = zonedDate(date, event.timezone);
      anchor.download = `${event.slug}-report-${today}${options.snapshot ? '-frozen-final' : ''}${includeRehearsal ? '-with-rehearsal' : ''}.${format}`;
      anchor.click();

      URL.revokeObjectURL(url);
    } catch {
      // Silence here used to look identical to a browser that had blocked the
      // download — the Lead would tap twice more and then ask whether the
      // report existed at all.
      setExportError(
        `The ${format.toUpperCase()} could not be generated. Try again, or take the figures from this page.`,
      );
    } finally {
      setDownloading(null);
    }
  }

  return { downloading, exportError, download };
}
