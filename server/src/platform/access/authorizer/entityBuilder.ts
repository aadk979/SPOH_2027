import { ROLE_RANKS, type Action, type Role } from '@spoh/access-policies';
import type { CedarValueJson, EntityJson, TypeAndId } from '@cedar-policy/cedar-wasm/nodejs';
import type { PrismaTransactionClient } from '../../db/client.js';
import { NotFoundError } from '../../errors/index.js';
import { campusCidrs, onCampus, rootMembershipId } from '../../event/attendanceAuthority.js';
import { eventDayAnchorOf } from '../../time/index.js';
import { resourceEntity, type ResourceRef } from './resourceEntities.js';
import { databaseRoleGrants, type RoleGrantSource } from './roleGrants.js';
import { ref, uid, type AuthorizationRequest } from './types.js';

export type { ResourceRef, ResourceType } from './resourceEntities.js';

/** What the request itself tells the policies, beside the stored state. */
export interface RequestFacts {
  /** True only for a queued capture recorded before the close, inside its grace (ADR-004 §1). */
  readonly lateSyncAllowed?: boolean;
  /** The caller's address, for the event's trusted networks. */
  readonly ip?: string | null;
  /** People.AssignRole and People.Invite: the rank of the role being granted. */
  readonly grantedRank?: number;
}

/** May the principal take this action on this resource, given what the request says? */
export interface Question {
  readonly action: Action;
  readonly resource: ResourceRef;
  readonly facts?: RequestFacts;
}

export interface EntityBuilderOptions {
  readonly eventId: string;
  /** The injected clock's instant, sampled by the caller after any lock wait. */
  readonly now: Date;
  /** When the shift on duty is judged; a late-synced capture's recorded time. */
  readonly shiftAt?: Date;
  readonly grants?: RoleGrantSource;
}

interface EventFacts {
  readonly organisationId: string;
  readonly status: string;
  readonly timezone: string;
  readonly dayBoundaryMinutes: number;
}

/**
 * The entities and context for one request, read from the database inside the
 * caller's transaction (ADR-005 §1). Nothing comes from the token except who is
 * asking. Every lookup names the event (ADR-001 §2), so a row of another event is
 * not found. One builder serves one request: every entity is read once.
 */
export class EntityBuilder {
  private readonly entities = new Map<string, EntityJson>();
  private readonly grants: RoleGrantSource;
  private readonly shiftAt: Date;
  private facts: Promise<EventFacts> | null = null;

  constructor(
    private readonly tx: PrismaTransactionClient,
    private readonly options: EntityBuilderOptions,
  ) {
    this.grants = options.grants ?? databaseRoleGrants;
    this.shiftAt = options.shiftAt ?? options.now;
  }

  /** An event action by a member of this event. */
  async forMembership(membershipId: string, question: Question): Promise<AuthorizationRequest> {
    return this.request(await this.membership(membershipId), question);
  }

  /** A platform action, or a locked action, by a person (ADR-005 §1). */
  async forPerson(personId: string, question: Question): Promise<AuthorizationRequest> {
    return this.request(await this.person(personId), question);
  }

  private async request(
    principal: TypeAndId,
    { action, resource, facts = {} }: Question,
  ): Promise<AuthorizationRequest> {
    const target = await resourceEntity(this.tx, resource, {
      put: (entity) => this.put(entity),
      event: () => this.eventEntity(),
      organisation: () => this.organisationUid,
      membership: (id) => this.membership(id),
      eventId: this.options.eventId,
      now: this.options.now,
    });
    return {
      principal,
      action,
      resource: target,
      context: await this.context(facts),
      entities: [...this.entities.values()].sort(byUid),
      eventId: this.options.eventId,
    };
  }

  private async context(facts: RequestFacts): Promise<Record<string, CedarValueJson>> {
    const event = await this.event();
    const cidrs = await campusCidrs({ eventId: this.options.eventId }, this.tx);
    return {
      eventPhase: event.status,
      lateSyncAllowed: facts.lateSyncAllowed ?? false,
      onTrustedNetwork: onCampus(facts.ip ?? null, cidrs),
      ...(facts.grantedRank === undefined ? {} : { grantedRank: facts.grantedRank }),
    };
  }

  private put(entity: EntityJson): void {
    this.entities.set(key(entity.uid as TypeAndId), entity);
  }

  private has(entity: TypeAndId): boolean {
    return this.entities.has(key(entity));
  }

  private event(): Promise<EventFacts> {
    this.facts ??= this.tx.event
      .findUnique({
        where: { id: this.options.eventId },
        select: { organisationId: true, status: true, timezone: true, dayBoundaryMinutes: true },
      })
      .then((row) => {
        if (!row) throw new NotFoundError('Event');
        return row;
      });
    return this.facts;
  }

  private organisationUid: TypeAndId | null = null;

  /** The event entity, under its organisation. */
  private async eventEntity(): Promise<TypeAndId> {
    const event = await this.event();
    const organisation = uid('Organisation', event.organisationId);
    this.organisationUid = organisation;
    const entity = uid('Event', this.options.eventId);
    if (!this.has(entity)) {
      this.put({ uid: organisation, attrs: {}, parents: [] });
      this.put({ uid: entity, attrs: {}, parents: [organisation] });
    }
    return entity;
  }

  /**
   * People have no deactivation of their own yet; a membership's status carries it
   * (P12 adds the person lifecycle). Platform authority is the person's role in the
   * organisation of this event.
   */
  private async person(personId: string): Promise<TypeAndId> {
    const entity = uid('Person', personId);
    if (this.has(entity)) return entity;
    const person = await this.tx.person.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!person) throw new NotFoundError('Person');
    const { organisationId } = await this.event();
    const member = await this.tx.organisationMembership.findUnique({
      where: { organisationId_personId: { organisationId, personId } },
      select: { role: true },
    });
    this.put({
      uid: entity,
      attrs: { active: true, platformAdmin: member?.role === 'PLATFORM_ADMIN' },
      parents: [],
    });
    return entity;
  }

  private async role(role: Role): Promise<TypeAndId> {
    const entity = uid('Role', `${this.options.eventId}/${role}`);
    if (this.has(entity)) return entity;
    const grants = (await this.grants.grantsFor(this.tx, this.options.eventId))[role];
    this.put({
      uid: entity,
      attrs: {
        catalogueRole: role,
        rank: ROLE_RANKS[role],
        grants: [...grants.grants].sort(),
        anyStation: grants.anyStation,
      },
      parents: [await this.eventEntity()],
    });
    return entity;
  }

  /** A membership with everything the policies read about it (ADR-005 §1). */
  private async membership(membershipId: string): Promise<TypeAndId> {
    const entity = uid('Membership', membershipId);
    if (this.has(entity)) return entity;
    const { eventId } = this.options;
    const member = await this.tx.eventMembership.findFirst({
      where: { id: membershipId, eventId },
      select: { personId: true, role: true, status: true },
    });
    if (!member) throw new NotFoundError('Membership');
    const event = await this.eventEntity();
    const person = await this.person(member.personId);
    const role = await this.role(member.role);
    this.put({
      uid: entity,
      attrs: {
        event: { __entity: event },
        person: { __entity: person },
        role: { __entity: role },
        rank: ROLE_RANKS[member.role],
        active: member.status === 'ACTIVE',
        ...(await this.rostered(membershipId)),
        attendanceVerifiedToday: await this.verifiedToday(member.personId),
        isAttendanceRoot: (await rootMembershipId({ eventId }, this.tx)) === membershipId,
      },
      parents: [event],
    });
    return entity;
  }

  /** Where and when the membership is rostered, and where its shift is running now. */
  private async rostered(membershipId: string): Promise<Record<string, CedarValueJson>> {
    const assignments = await this.tx.shiftAssignment.findMany({
      where: { eventId: this.options.eventId, membershipId },
      select: {
        stationId: true,
        eventDayId: true,
        shift: { select: { startsAt: true, endsAt: true } },
      },
    });
    const at = this.shiftAt.getTime();
    const onShift = assignments.filter(
      ({ shift }) => shift.startsAt.getTime() <= at && at < shift.endsAt.getTime(),
    );
    return {
      assignedStations: refs(
        'Station',
        assignments.map(({ stationId }) => stationId),
      ),
      onShiftStations: refs(
        'Station',
        onShift.map(({ stationId }) => stationId),
      ),
      workingDays: refs(
        'EventDay',
        assignments.map(({ eventDayId }) => eventDayId),
      ),
    };
  }

  /** Attendance recorded today, in the event's capture mode, as the attendance rules read it. */
  private async verifiedToday(personId: string): Promise<boolean> {
    const event = await this.event();
    const { eventId } = this.options;
    const date = eventDayAnchorOf(this.options.now, event);
    const day = await this.tx.eventDay.findUnique({
      where: { eventId_date: { eventId, date } },
      select: { id: true },
    });
    if (!day) return false;
    const presence = await this.tx.attendance.findFirst({
      where: {
        eventId,
        volunteerId: personId,
        eventDayId: day.id,
        rehearsal: event.status === 'REHEARSAL',
      },
      select: { id: true },
    });
    return presence !== null;
  }
}

function key(entity: TypeAndId): string {
  return `${entity.type}::${entity.id}`;
}

function byUid(a: EntityJson, b: EntityJson): number {
  const left = key(a.uid as TypeAndId);
  const right = key(b.uid as TypeAndId);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** A Cedar set of entity references, without duplicates and in a stable order. */
function refs(type: string, ids: readonly string[]): CedarValueJson[] {
  return [...new Set(ids)].sort().map((id) => ref(type, id));
}
