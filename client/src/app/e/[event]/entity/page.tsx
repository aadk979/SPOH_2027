import { Suspense } from 'react';
import { EntityScreen } from '@/features/workspace';
import { LoadingRows } from '@/shared/ui';
export default function EntityPage() {
  return <Suspense fallback={<LoadingRows label="Loading this record" />}><EntityScreen /></Suspense>;
}
