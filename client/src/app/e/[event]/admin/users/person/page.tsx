import { Suspense } from 'react';
import PersonScreen from '@/features/people/screens/PersonScreen';
import { LoadingRows } from '@/shared/ui';
export default function PersonPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <PersonScreen />
    </Suspense>
  );
}
