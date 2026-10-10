import type { ReactNode } from 'react';
import type { EventContent } from '@spoh/shared';
import type { FormErrors } from '@/shared/hooks/useZodForm';
import { Field, Select, Stack } from '@/shared/ui';
import { useStations } from '@/features/stations';
import { ContentTextField } from './ContentTextField';
type Point = EventContent['map']['levels'][number]['points'][number];
export function MapPointFields({
  point,
  path,
  number,
  errors,
  onChange,
}: {
  point: Point;
  path: string;
  number: number;
  errors: FormErrors;
  onChange(point: Point): void;
}): ReactNode {
  const { data: stations } = useStations();
  return (
    <Stack>
      <ContentTextField
        path={`${path}.label`}
        label={`Location ${number}`}
        max={80}
        value={point.label}
        error={errors[`${path}.label`]}
        onChange={(label) => onChange({ ...point, label })}
      />
      <Field id={`${path}-kind`} label={`Location ${number}: type`}>
        {(props) => (
          <Select
            {...props}
            value={point.kind}
            onChange={(event) =>
              onChange({ ...point, kind: event.target.value as typeof point.kind })
            }
          >
            <option value="station">Station</option>
            <option value="facility">Facility</option>
            <option value="safety">Safety</option>
          </Select>
        )}
      </Field>
      <Field
        id={`${path}-station`}
        label={`Location ${number}: station`}
        optional
        error={errors[`${path}.stationId`]}
      >
        {(props) => (
          <Select
            {...props}
            value={point.stationId ?? ''}
            onChange={(event) => onChange({ ...point, stationId: event.target.value || undefined })}
          >
            <option value="">No station link</option>
            {stations?.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </Stack>
  );
}
