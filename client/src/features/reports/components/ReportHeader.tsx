import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { Card, CardTitle } from '@/shared/ui';
export function ReportHeader({ data }: { data: FullReport }): ReactNode {
  return (
    <Card tone="info">
      <CardTitle>How to read these numbers</CardTitle>
      {/* The single most-misread thing in the system; it gets the pace. */}
      <p className="mt-xs text-reading">{data.countingNote}</p>
    </Card>
  );
}
