/**
 * @spoh/shared — the single definition of every DTO crossing the wire.
 *
 * Rules (BUILD_PLAN §2.3):
 *  - zod schemas and inferred types only, no runtime logic beyond pure helpers
 *  - exactly one runtime dependency: zod
 *  - imported by both `server` and `client`; imports neither
 */
export * from './enums.js';
export * from './capabilities.js';
export * from './errorCodes.js';

export * from './dto/common.js';
export * from './dto/station.js';
export * from './dto/me.js';
export * from './dto/registration.js';
export * from './dto/footfall.js';
export * from './dto/incident.js';
export * from './dto/lostPerson.js';
export * from './dto/roster.js';
export * from './dto/missionCard.js';
export * from './dto/gift.js';
export * from './dto/announcement.js';
export * from './dto/shift.js';
export * from './dto/dashboard.js';
export * from './dto/fallback.js';
export * from './dto/lostFound.js';
export * from './dto/report.js';
export * from './dto/auth.js';
export * from './dto/admin.js';
export * from './dto/settings.js';
export * from './dto/notification.js';
export * from './dto/media.js';
export * from './dto/attendance.js';
