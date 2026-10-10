import { z } from 'zod';
import { ACTION_GROUPS, ACTION_IDS, ROLE_IDS } from '../../generated/actions/index.js';
import { Id, IdempotencyKey } from '../common/index.js';

/**
 * The event's role permissions (P11.7, ADR-005 §4): what each role may do, which of it an
 * editor may change, and the guardrails no grant overrides.
 */
const ActionId = z.enum(ACTION_IDS);
const RoleId = z.enum(ROLE_IDS);

export const RolePermissionAction = z
  .object({
    action: ActionId,
    /** Plain language: a verb phrase from `ACTION_LABELS`. */
    label: z.string(),
    groups: z.array(z.enum(ACTION_GROUPS)),
    /**
     * Toggled per role in this event (an Editable action with an approved floor). Every other
     * action is fixed: self-service, a guardrail, or platform admins' alone.
     */
    editable: z.boolean(),
    /** The lowest role the action may be granted to; null when it is not editable. */
    minimumRole: RoleId.nullable(),
  })
  .strict();
export type RolePermissionAction = z.infer<typeof RolePermissionAction>;

export const RolePermissionRole = z
  .object({
    role: RoleId,
    rank: z.number().int(),
    /** The Editable actions this event grants the role. */
    grants: z.array(ActionId),
    /** May capture at any station, off its roster (IC and above; not editable). */
    anyStation: z.boolean(),
  })
  .strict();

export const RolePermissionGuardrail = z
  .object({ id: z.string(), explanation: z.string() })
  .strict();

export const RolePermissionsResponse = z
  .object({
    data: z
      .object({
        roles: z.array(RolePermissionRole),
        actions: z.array(RolePermissionAction),
        guardrails: z.array(RolePermissionGuardrail),
        /** Whether the caller may change grants (`Permissions.Edit`, platform admins). */
        canEdit: z.boolean(),
        review: z
          .object({
            version: z.number().int().nonnegative(),
            reviewedVersion: z.number().int().nonnegative().nullable(),
            reviewedAt: z.iso.datetime().nullable(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
export type RolePermissionsResponse = z.infer<typeof RolePermissionsResponse>;

export const ChangeRolePermissionRequest = z
  .object({
    role: RoleId,
    action: ActionId,
    granted: z.boolean(),
    idempotencyKey: IdempotencyKey,
  })
  .strict();
export type ChangeRolePermissionRequest = z.infer<typeof ChangeRolePermissionRequest>;

export const ReviewRolePermissionsRequest = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: IdempotencyKey,
  })
  .strict();
export type ReviewRolePermissionsRequest = z.infer<typeof ReviewRolePermissionsRequest>;

/** A resource to ask about; the event when absent. */
export const SimulatedResource = z
  .object({ type: z.enum(['Event', 'Station', 'Membership', 'Setting']), id: z.string().min(1) })
  .strict();

export const SimulatePermissionRequest = z
  .object({ personId: Id, action: ActionId, resource: SimulatedResource.optional() })
  .strict();
export type SimulatePermissionRequest = z.infer<typeof SimulatePermissionRequest>;

export const SimulatePermissionResponse = z
  .object({
    data: z
      .object({
        allowed: z.boolean(),
        /** The `@id`s of the policies that decided it. */
        policies: z.array(z.string()),
        /** Why, in plain language. */
        explanation: z.string(),
      })
      .strict(),
  })
  .strict();
export type SimulatePermissionResponse = z.infer<typeof SimulatePermissionResponse>;

/** "What can ⟨person⟩ do?": the same answer `/me/permissions` gives the member themselves. */
export const MemberPermissionsResponse = z
  .object({
    data: z
      .object({
        personId: Id,
        role: RoleId,
        actions: z.record(z.string(), z.boolean()),
      })
      .strict(),
  })
  .strict();
export type MemberPermissionsResponse = z.infer<typeof MemberPermissionsResponse>;
