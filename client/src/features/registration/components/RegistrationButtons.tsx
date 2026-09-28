import type { ReactNode } from 'react';
import { type useCapture } from '@/features/capture';
import { registrationEndpoints } from '@/features/registration';
import { CATEGORIES } from '../model/categories';
export function RegistrationButtons({
  stationId,
  capture,
}: {
  stationId: string;
  capture: ReturnType<typeof useCapture>['capture'];
}): ReactNode {
  return (
    <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
      {CATEGORIES.map((category) => (
        <button
          key={category.value}
          type="button"
          className="capture-target"
          onClick={() =>
            void capture({
              endpoint: registrationEndpoints.single,
              body: { category: category.value, stationId },
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
