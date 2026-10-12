import type { WorkspaceSources } from '../modules/workspace/index.js';
import { stationWorkspaceSource } from '../modules/station/index.js';
import { peopleWorkspaceSource } from '../modules/people/index.js';
import { structureWorkspaceSource } from '../modules/structure/index.js';
import { assignmentWorkspaceSource } from '../modules/assignments/index.js';
import { registrationWorkspaceSource } from '../modules/registration/index.js';
import { footfallWorkspaceSource } from '../modules/footfall/index.js';
import { cardWorkspaceSource, stampWorkspaceSource } from '../modules/missionCard/index.js';
import { giftWorkspaceSource, redemptionWorkspaceSource } from '../modules/gift/index.js';
import { fallbackWorkspaceSource, importWorkspaceSource } from '../modules/fallback/index.js';
import { incidentWorkspaceSource } from '../modules/incident/index.js';
import { lostPersonWorkspaceSource } from '../modules/lostPerson/index.js';
import { lostFoundWorkspaceSource } from '../modules/lostFound/index.js';
import { announcementWorkspaceSource } from '../modules/announcement/index.js';
import { createAuditWorkspaceSource } from '../modules/audit/index.js';

const auditWorkspaceSource = createAuditWorkspaceSource((context, ref) => workspaceSources.entities[ref.kind].entity(context, ref));
/** Complete dictionaries make new kinds a composition/type error rather than an empty private read. */
export const workspaceSources: WorkspaceSources = {
  entities: { station: stationWorkspaceSource, person: peopleWorkspaceSource, 'event-day': structureWorkspaceSource,
    shift: structureWorkspaceSource, assignment: assignmentWorkspaceSource, registration: registrationWorkspaceSource,
    footfall: footfallWorkspaceSource, card: cardWorkspaceSource, redemption: redemptionWorkspaceSource,
    gift: giftWorkspaceSource, fallback: fallbackWorkspaceSource, import: importWorkspaceSource,
    incident: incidentWorkspaceSource, 'lost-person': lostPersonWorkspaceSource, 'lost-found': lostFoundWorkspaceSource,
    announcement: announcementWorkspaceSource, audit: auditWorkspaceSource },
  records: { registrations: registrationWorkspaceSource, footfall: footfallWorkspaceSource, cards: cardWorkspaceSource,
    stamps: stampWorkspaceSource, redemptions: redemptionWorkspaceSource, 'gift-ledger': giftWorkspaceSource,
    fallback: fallbackWorkspaceSource, imports: importWorkspaceSource, incidents: incidentWorkspaceSource,
    'lost-person': lostPersonWorkspaceSource, 'lost-found': lostFoundWorkspaceSource, announcements: announcementWorkspaceSource,
    assignments: assignmentWorkspaceSource, people: peopleWorkspaceSource, days: structureWorkspaceSource, audit: auditWorkspaceSource },
};
