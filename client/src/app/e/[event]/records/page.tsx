import { Suspense } from 'react';
import { RecordsScreen } from '@/features/workspace';
import { LoadingRows } from '@/shared/ui';
export default function RecordsPage() {
  return <Suspense fallback={<LoadingRows label="Loading filtered records" />}><RecordsScreen /></Suspense>;
}
