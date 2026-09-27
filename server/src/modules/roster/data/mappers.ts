import type { VolunteerRecord } from '@spoh/shared';
import type { Volunteer } from './repo.js';

export function toVolunteerRecord(volunteer: Volunteer): VolunteerRecord {
  return {
    id: volunteer.id,
    displayName: volunteer.displayName,
    email: volunteer.email,
    phone: volunteer.phone,
    role: volunteer.role,
    portfolio: volunteer.portfolio,
    reportsToId: volunteer.reportsToId,
    active: volunteer.active,
    createdAt: volunteer.createdAt.toISOString(),
  };
}
