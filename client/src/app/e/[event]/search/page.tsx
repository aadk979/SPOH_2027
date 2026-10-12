import { Suspense } from 'react';
import { SearchScreen } from '@/features/workspace';
import { LoadingRows } from '@/shared/ui';
export default function SearchPage() {
  return <Suspense fallback={<LoadingRows label="Loading search" />}><SearchScreen /></Suspense>;
}
