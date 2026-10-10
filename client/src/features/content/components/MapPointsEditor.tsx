import type { ReactNode } from 'react';
import type { EventContent } from '@spoh/shared';
import type { FormErrors } from '@/shared/hooks/useZodForm';
import { Button, Stack } from '@/shared/ui';
import { replaceItem } from '../model/contentEditor';
import { MapPointFields } from './MapPointFields';
type Floor = EventContent['map']['levels'][number];
export function MapPointsEditor({
  floor,
  index,
  errors,
  onChange,
}: {
  floor: Floor;
  index: number;
  errors: FormErrors;
  onChange(floor: Floor): void;
}): ReactNode {
  return (
    <Stack>
      {floor.points.map((point, i) => (
        <Stack key={i}>
          <MapPointFields
            point={point}
            path={`map.levels.${index}.points.${i}`}
            number={i + 1}
            errors={errors}
            onChange={(next) => onChange({ ...floor, points: replaceItem(floor.points, i, next) })}
          />
          <Button
            type="button"
            variant="quiet"
            onClick={() => onChange({ ...floor, points: floor.points.filter((_, n) => n !== i) })}
          >
            Remove location {i + 1}
          </Button>
        </Stack>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={floor.points.length >= 100}
        onClick={() =>
          onChange({ ...floor, points: [...floor.points, { label: '', kind: 'facility' }] })
        }
      >
        Add location
      </Button>
    </Stack>
  );
}
