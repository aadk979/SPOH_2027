import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { reportReadLabel } from '@spoh/shared';
import { Card, CardTitle } from '@/shared/ui';
export function ReportHeader({
  data,
}: {
  data: Pick<FullReport, 'snapshot' | 'event' | 'countingNote'>;
}): ReactNode {
  return (
    <Card tone="info">
      <p role="note" aria-label="Report version" className="mb-sm text-reading font-semibold">
        {reportReadLabel(data)}
      </p>
      <CardTitle>How to read these numbers</CardTitle>
      {/* The single most-misread thing in the system; it gets the pace. */}
      <p className="mt-xs text-reading">{data.countingNote}</p>
    </Card>
  );
}
