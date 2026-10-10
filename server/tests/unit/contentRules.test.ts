import { describe, expect, it } from 'vitest';
import { EventContent, PublishedContentRecord } from '@spoh/shared';
import type { ContentVersion } from '../../src/generated/prisma/client.js';
import {
  contentReferences,
  frozenContent,
  publicationImageKey,
} from '../../src/modules/content/domain/contentRules.js';
import { remapContent } from '../../src/modules/content/domain/cloneContent.js';
import { toContentDraft, toPublishedContent } from '../../src/modules/content/data/mappers.js';
import { guideContent } from '../helpers/content.js';

const referenced = () => {
  const body = guideContent();
  body.brief.programmes = [
    {
      stationTagId: 'tag',
      oneLiner: 'Try this station.',
      faqs: [{ question: 'Where?', answer: 'At the desk.' }],
    },
  ];
  body.journey.steps[0]!.stationIds = ['station', 'station'];
  body.map.levels[0]!.points = [{ label: 'Desk', kind: 'station', stationId: 'station' }];
  body.map.levels[0]!.image = { mediaKey: 'draft-image', alt: 'Accessible desk entrance' };
  return body;
};
describe('event content', () => {
  it('validates every required section, text length and unknown fields', () => {
    expect(EventContent.safeParse(guideContent()).success).toBe(true);
    expect(EventContent.safeParse({ ...guideContent(), injected: 'html' }).success).toBe(false);
    expect(
      EventContent.safeParse({ ...guideContent(), briefing: { mandatoryPoints: [] } }).success,
    ).toBe(false);
    const body = guideContent();
    body.brief.escalationScript = 'x'.repeat(401);
    expect(EventContent.safeParse(body).success).toBe(false);
  });
  it('deduplicates every owned tag, station and image before scoped lookup', () => {
    expect(contentReferences(referenced())).toEqual({
      tags: ['tag'],
      stations: ['station'],
      images: ['draft-image'],
    });
  });
  it('freezes copied images without mutating the draft', () => {
    const body = referenced();
    const frozen = frozenContent(
      body,
      new Map([['draft-image', publicationImageKey('event', 'version', 0)]]),
    );
    expect(body.map.levels[0]!.image!.mediaKey).toBe('draft-image');
    expect(frozen.map.levels[0]!.image!.mediaKey).toBe('content/event/version/map-0');
    expect(frozenContent(body, new Map())).toEqual(body);
  });
  it('gives the clone its own references and drops unselected source structure', () => {
    const body = referenced();
    const clone = remapContent({
      body,
      stationIds: new Map([['station', 'target-station']]),
      stationTagIds: new Map([['tag', 'target-tag']]),
      images: new Map([['draft-image', 'target-image']]),
    });
    expect(contentReferences(clone)).toEqual({
      tags: ['target-tag'],
      stations: ['target-station'],
      images: ['target-image'],
    });
    const textOnly = remapContent({
      body,
      stationIds: new Map(),
      stationTagIds: new Map(),
      images: new Map(),
    });
    expect(contentReferences(textOnly)).toEqual({
      tags: [],
      stations: [],
      images: ['draft-image'],
    });
    expect(body).toEqual(referenced());
  });
  it('exposes only immutable authenticated publication assets and a strict DTO', () => {
    const body = frozenContent(
      referenced(),
      new Map([['draft-image', 'content/event/version/map-0']]),
    );
    const row = {
      id: 'version',
      eventId: 'event',
      version: 1,
      draftVersion: 2,
      body,
      objectKey: 'content/event/version.json',
      etag: '"hash"',
      publishedAt: new Date('2026-10-10T00:00:00Z'),
      publishedByPersonId: 'person',
    } as ContentVersion;
    const dto = PublishedContentRecord.parse(toPublishedContent(row));
    expect(dto.path).toBe('/events/event/content?v=version');
    expect(dto.images).toEqual({
      'content/event/version/map-0': '/events/event/content/assets/version/map-0',
    });
    expect(toContentDraft('event', null)).toMatchObject({
      eventId: 'event',
      body: null,
      version: 0,
      reviewedAt: null,
    });
  });
});
