/**
 * @spoh/shared — the single definition of every DTO crossing the wire.
 *
 * Rules (BUILD_PLAN §2.3):
 *  - zod schemas and inferred types only, no runtime logic beyond pure helpers
 *  - exactly one runtime dependency: zod
 *  - imported by both `server` and `client`; imports neither
 *
 * Layout (engineering-standards §5): `contracts/<domain>/` mirrors the server
 * module of the same name; `errors/` holds the error codes; `invariants/` the
 * enums that are product invariants; `access/` the capability matrix until P11;
 * `generated/` what tools write. This index is the only public entry point.
 */
export * from './invariants/enums.js';
/** The compiled capability matrix, re-exported until P11 replaces it with Cedar actions. */
export * from './access/capabilities.js';
export * from './errors/errorCodes.js';
export * from './contracts/missionCard/cardCode.js';

export * from './contracts/common/index.js';
export * from './contracts/station/index.js';
export * from './contracts/me/index.js';
export * from './contracts/registration/index.js';
export * from './contracts/footfall/index.js';
export * from './contracts/incident/index.js';
export * from './contracts/lostPerson/index.js';
export * from './contracts/roster/index.js';
export * from './contracts/missionCard/index.js';
export * from './contracts/gift/index.js';
export * from './contracts/announcement/index.js';
export * from './contracts/shift/index.js';
export * from './contracts/dashboard/index.js';
export * from './contracts/fallback/index.js';
export * from './contracts/lostFound/index.js';
export * from './contracts/report/index.js';
export * from './contracts/auth/index.js';
export * from './contracts/people/index.js';
export * from './contracts/assignments/index.js';
export * from './contracts/eventDays/index.js';
export * from './contracts/settings/index.js';
export * from './contracts/notification/index.js';
export * from './contracts/media/index.js';
export * from './contracts/attendance/index.js';
