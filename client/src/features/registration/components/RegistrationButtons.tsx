import type { ReactNode } from 'react';
import { type useCapture } from '@/features/capture';
import { registrationEndpoints } from '@/features/registration';
import { useCaptureCategories } from '../queries';
export function RegistrationButtons({
  stationId,
  capture,
}: {
  stationId: string;
  capture: ReturnType<typeof useCapture>['capture'];
}): ReactNode {
  const { data: categories = [] } = useCaptureCategories();
  return (
    <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
      {categories.map((category) => (
        <button
          key={category.code}
          type="button"
          className="capture-target"
          onClick={() =>
            void capture({
              endpoint: registrationEndpoints.single,
              body: { category: category.code, stationId },
              label: category.label,
            })
          }
        >
          {category.label}
        </button>
      ))}
    </div>
  );
}
