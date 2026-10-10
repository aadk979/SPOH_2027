import type { EventContent } from '@spoh/shared';

export const CONTENT_KEYS = ['brief', 'journey', 'map', 'briefing'] as const;
export const CONTENT_BUDGET_BYTES = 2 * 1024 * 1024;

/** References are validated against rows in the path event before draft save and publication. */
export function contentReferences(body: EventContent) {
  return {
    tags: [...new Set(body.brief.programmes.map((programme) => programme.stationTagId))],
    stations: [
      ...new Set([
        ...body.journey.steps.flatMap((step) => step.stationIds ?? []),
        ...body.map.levels.flatMap((level) =>
          level.points.flatMap((point) => (point.stationId ? [point.stationId] : [])),
        ),
      ]),
    ],
    images: [
      ...new Set(body.map.levels.flatMap((level) => (level.image ? [level.image.mediaKey] : []))),
    ],
  };
}

export function publicationImageKey(eventId: string, versionId: string, index: number) {
  return `content/${eventId}/${versionId}/map-${index}`;
}

/** Replace only owned image references with the publication's frozen same-origin paths. */
export function frozenContent(
  body: EventContent,
  imagePaths: ReadonlyMap<string, string>,
): EventContent {
  return {
    ...body,
    map: {
      ...body.map,
      levels: body.map.levels.map((level) => ({
        ...level,
        ...(level.image
          ? {
              image: {
                ...level.image,
                mediaKey: imagePaths.get(level.image.mediaKey) ?? level.image.mediaKey,
              },
            }
          : {}),
      })),
    },
  };
}
