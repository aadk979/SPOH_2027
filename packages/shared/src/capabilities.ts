import { z } from 'zod';
import type { CommitteeRole } from './enums.js';

/**
 * The capability matrix from BUILD_PLAN §6.3, transcribed literally.
 *
 * Why a matrix rather than role precedence: precedence alone is wrong here.
 * `Lead` outranks `Volunteer` (precedence 10 vs 50) yet must NOT be able to
 * create a registration — the Lead is a read-and-report role. Any middleware
 * that asked "is the caller at least a Volunteer?" would wrongly admit a Lead.
 * Capabilities are therefore the authorization primitive; precedence is only
 * used for picking the highest Cognito group and for display ordering.
 *
 * The server enforces this. The client reads the same table to decide which
 * tiles to render — UI affordance only (BUILD_PLAN §6.4).
 */
export const Capability = z.enum([
  'registration.create',
  'footfall.create',
  'card.stamp',
  'gift.redeem',
  'record.void',
  'count.adjust',
  'card.reissue',
  'incident.report',
  'incident.resolve',
  'lostPerson.raise',
  'lostPerson.resolve',
  'lostFound.log',
  'own.read',
  'dashboard.station.read',
  'dashboard.event.read',
  'swap.approve',
  'roster.edit',
  'announcement.station.send',
  'announcement.event.send',
  'fallback.declare',
  'fallback.import',
  'report.generate',
  'user.provision',
  'audit.read',
]);
export type Capability = z.infer<typeof Capability>;

type Matrix = Readonly<Record<Capability, readonly CommitteeRole[]>>;

const V = 'VOLUNTEER' as const;
const I = 'IC' as const;
const D = 'DEPUTY_COORDINATOR' as const;
const C = 'CHIEF_COORDINATOR' as const;
const L = 'LEAD' as const;
const A = 'ADMIN' as const;

/** Roles granted each capability. Absence from the list is a hard deny. */
export const CAPABILITY_MATRIX: Matrix = Object.freeze({
  'registration.create': [V, I, D, C, A],
  'footfall.create': [V, I, D, C, A],
  'card.stamp': [V, I, D, C, A],
  'gift.redeem': [V, I, D, C, A],
  'record.void': [I, D, C, A],
  'count.adjust': [I, D, C, A],
  'card.reissue': [I, D, C, A],
  'incident.report': [V, I, D, C, L, A],
  'incident.resolve': [I, D, C, A],
  'lostPerson.raise': [V, I, D, C, L, A],
  'lostPerson.resolve': [I, D, C, A],
  'lostFound.log': [V, I, D, C, A],
  'own.read': [V, I, D, C, L, A],
  'dashboard.station.read': [I, D, C, L, A],
  'dashboard.event.read': [D, C, L, A],
  'swap.approve': [I, D, C, A],
  'roster.edit': [D, C, A],
  'announcement.station.send': [I, D, C, A],
  'announcement.event.send': [D, C, A],
  'fallback.declare': [D, C, A],
  'fallback.import': [C, A],
  'report.generate': [D, C, L, A],
  'user.provision': [C, A],
  'audit.read': [C, L, A],
});

/** Does this role hold this capability? The single authorization predicate. */
export function roleHasCapability(role: CommitteeRole, capability: Capability): boolean {
  return CAPABILITY_MATRIX[capability].includes(role);
}

/** Every capability held by a role — sent to the client on `GET /me`. */
export function capabilitiesForRole(role: CommitteeRole): Capability[] {
  return Capability.options.filter((cap) => roleHasCapability(role, cap));
}

/**
 * Capture capabilities are additionally station-scoped: holding the capability
 * is necessary but not sufficient, the caller must also be on shift at the
 * target station (BUILD_PLAN §6.3 layer 2).
 */
export const STATION_SCOPED_CAPABILITIES: readonly Capability[] = Object.freeze([
  'registration.create',
  'footfall.create',
  'card.stamp',
  'gift.redeem',
]);

export function isStationScoped(capability: Capability): boolean {
  return STATION_SCOPED_CAPABILITIES.includes(capability);
}
