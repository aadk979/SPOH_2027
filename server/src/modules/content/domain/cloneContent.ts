import type { EventContent } from '@spoh/shared';

/** Unselected station structure leaves no cross-event references in the copied text. */
export function remapContent(input: {
  body: EventContent;
  stationIds: ReadonlyMap<string, string>;
  stationTagIds: ReadonlyMap<string, string>;
  images: ReadonlyMap<string, string>;
}): EventContent {
  const { body, stationIds, stationTagIds, images } = input;
  return {
    ...body,
    brief: {
      ...body.brief,
      programmes: body.brief.programmes.flatMap((programme) => {
        const stationTagId = stationTagIds.get(programme.stationTagId);
        return stationTagId ? [{ ...programme, stationTagId }] : [];
      }),
    },
    journey: {
      ...body.journey,
      steps: body.journey.steps.map((step) => ({
        ...step,
        ...(step.stationIds
          ? { stationIds: step.stationIds.flatMap((id) => stationIds.get(id) ?? []) }
          : {}),
      })),
    },
    map: {
      ...body.map,
      levels: body.map.levels.map((level) => ({
        ...level,
        ...(level.image
          ? {
              image: {
                ...level.image,
                mediaKey: images.get(level.image.mediaKey) ?? level.image.mediaKey,
              },
            }
          : {}),
        points: level.points.flatMap((point) => {
          if (!point.stationId) return [point];
          const stationId = stationIds.get(point.stationId);
          return stationId ? [{ ...point, stationId }] : [];
        }),
      })),
    },
  };
}
