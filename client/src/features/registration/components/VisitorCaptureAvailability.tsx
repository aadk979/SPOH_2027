'use client';

import type { ReactNode } from 'react';
import { useEventSettings } from '@/features/settings';
import { VisitorCaptureForm } from '@/features/visitor';
import { useCaptureCategories } from '../queries';

/** The default event keeps the one-tap, count-only booth. */
export function VisitorCaptureAvailability({ stationId }: { stationId: string }): ReactNode {
  const { data: settings } = useEventSettings();
  const { data: categories = [] } = useCaptureCategories();
  if (settings?.settings['product.visitorDataMode'] !== 'allowlist') return null;
  return <VisitorCaptureForm stationId={stationId} categories={categories} />;
}
