import { useState, type ReactNode } from 'react';
import { Button, Section, Stack } from '@/shared/ui';
import { ContentTextField } from './ContentTextField';
import { replaceItem, type ContentSectionProps } from '../model/contentEditor';
import { MapPointsEditor } from './MapPointsEditor';
import { FloorPlanUpload } from './FloorPlanUpload';
export function MapEditor({ value, errors, onChange }: ContentSectionProps<'map'>): ReactNode {
  const [uploading, setUploading] = useState(false);
  return (
    <Section title="Floor map">
      {/* Keep the map snapshot stable until the uploaded image is applied. */}
      <fieldset
        disabled={uploading}
        aria-label="Floor map fields"
        className="m-0 min-w-0 border-0 p-0"
      >
        <Stack>
          <ContentTextField
            path="map.intro"
            label="Map introduction"
            max={200}
            value={value.intro}
            error={errors['map.intro']}
            onChange={(intro) => onChange({ ...value, intro })}
          />
          {value.levels.map((floor, index) => (
            <Stack key={index}>
              <ContentTextField
                path={`map.levels.${index}.label`}
                label={`Level ${index + 1}: name`}
                max={40}
                value={floor.label}
                error={errors[`map.levels.${index}.label`]}
                onChange={(label) =>
                  onChange({
                    ...value,
                    levels: replaceItem(value.levels, index, { ...floor, label }),
                  })
                }
              />
              <FloorPlanUpload
                floor={floor}
                index={index}
                errors={errors}
                onPendingChange={setUploading}
                onChange={(next) =>
                  onChange({ ...value, levels: replaceItem(value.levels, index, next) })
                }
              />
              <MapPointsEditor
                floor={floor}
                index={index}
                errors={errors}
                onChange={(next) =>
                  onChange({ ...value, levels: replaceItem(value.levels, index, next) })
                }
              />
              <Button
                type="button"
                variant="quiet"
                disabled={value.levels.length === 1}
                onClick={() =>
                  onChange({ ...value, levels: value.levels.filter((_, i) => i !== index) })
                }
              >
                Remove level {index + 1}
              </Button>
            </Stack>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={value.levels.length >= 10}
            onClick={() =>
              onChange({ ...value, levels: [...value.levels, { label: '', points: [] }] })
            }
          >
            Add level
          </Button>
        </Stack>
      </fieldset>
    </Section>
  );
}
