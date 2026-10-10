import type { EventContent } from '@spoh/shared';

export const guideContent = (): EventContent => ({
  schemaVersion: 1,
  brief: {
    escalationScript: 'Ask the event lead for help.',
    fiveThings: [{ text: 'Welcome visitors.' }],
    programmes: [],
  },
  journey: { steps: [{ title: 'Welcome', detail: 'Start at the welcome desk.' }] },
  map: { intro: 'Find the welcome desk.', levels: [{ label: 'Ground floor', points: [] }] },
  briefing: { mandatoryPoints: ['Keep accessible routes clear.'] },
});

export async function insertArchiveExportFixture(input: {
  db: typeof import('./db.js').rawDb;
  eventId: string;
  now: Date;
}) {
  const snapshot = await input.db.reportSnapshot.findFirstOrThrow({
    where: { eventId: input.eventId, kind: 'FINAL', supersededAt: null },
  });
  return input.db.archiveExport.create({
    data: {
      id: `archive-${snapshot.id}`,
      eventId: input.eventId,
      snapshotId: snapshot.id,
      lifecycleVersion: snapshot.lifecycleVersion,
      objectKey: `archive/${input.eventId}/fixture.xlsx`,
      createdAt: input.now,
    },
  });
}
export async function insertContentPublicationFixture(input: {
  db: typeof import('./db.js').rawDb;
  eventId: string;
  personId: string;
  now: Date;
}) {
  const document = await input.db.contentDocument.create({
    data: {
      eventId: input.eventId,
      body: guideContent(),
      version: 1,
      updatedByPersonId: input.personId,
      updatedAt: input.now,
    },
  });
  const version = await input.db.contentVersion.create({
    data: {
      id: `publication-${document.id}`,
      eventId: input.eventId,
      body: guideContent(),
      version: 1,
      draftVersion: 1,
      objectKey: `content/${input.eventId}/fixture.json`,
      etag: '"fixture"',
      publishedByPersonId: input.personId,
      publishedAt: input.now,
    },
  });
  await input.db.contentDocument.update({
    where: { eventId: input.eventId },
    data: { publishedVersionId: version.id },
  });
  return version;
}
