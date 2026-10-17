import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { AnnouncementRecord } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb } from '../helpers/db.js';
import { bearer, membershipOf } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';
const app = createApp();
let fixture: WorkspaceFixture;
beforeEach(async () => {
  fixture = await workspaceFixture();
  const member = await membershipOf(fixture.admin.id);
  const announcement = await rawDb.announcement.create({
    data: {
      eventId: fixture.eventId,
      authorId: fixture.admin.id,
      authorMembershipId: member.id,
      body: 'Synthetic owned acknowledgement privacy marker',
      requiresAck: true,
      priority: 'INFO',
      createdAt: FROZEN_NOW,
    },
  });
  await rawDb.announcementAck.create({
    data: {
      eventId: fixture.eventId,
      announcementId: announcement.id,
      volunteerId: fixture.admin.id,
      membershipId: member.id,
      ackedAt: FROZEN_NOW,
    },
  });
});
it.each(['scoped', 'alias'])(
  '%s never caches caller-specific inbox acknowledgement and author data',
  async (form) => {
    const path =
      (form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1') + '/announcements';
    const own = await request(app).get(path).set('Authorization', bearer(fixture.admin)),
      peer = await request(app).get(path).set('Authorization', bearer(fixture.ic));
    expect(own.status).toBe(200);
    expect(peer.status).toBe(200);
    expect(own.body.data).toHaveLength(1);
    expect(peer.body.data).toHaveLength(1);
    expect(AnnouncementRecord.parse(own.body.data[0]).ackedByMe).toBe(true);
    expect(AnnouncementRecord.parse(peer.body.data[0]).ackedByMe).toBe(false);
    expect(own.headers['cache-control']).toBe('private, no-store');
    expect(peer.headers['cache-control']).toBe('private, no-store');
  },
);
