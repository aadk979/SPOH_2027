import type { CommitteeRole } from '../../src/generated/prisma/enums.js';

/** The fixture's station kinds and courses: they decide its types and tags. */
type StationKind =
  | 'SIGNUP_BOOTH'
  | 'WELCOME_LOUNGE'
  | 'COURSE_STATION'
  | 'MISSION_COMPLETE'
  | 'WELCOME_PARTY'
  | 'OTHER';
type CourseCode = 'DAAA' | 'DCDF' | 'DCS' | 'DCITP';

/**
 * The development fixture (P09.11): one event shaped like SPOH 2027 and a
 * second, small one, with no literal dates — every day is an offset from
 * "today" on the event's clock. New fixtures rehearse outside shift hours with
 * practice captures, cards and stock. Development and test databases only.
 */

export const FIXTURE_EVENT = {
  id: 'evt_spoh2027',
  slug: 'spoh2027',
  name: 'SPOH 2027',
  venue: 'Singapore Polytechnic, T19',
  timezone: 'Asia/Singapore',
} as const;

/** Days as offsets from today: today is a sandbox, then the dry runs and the event. */
export const DAYS = [
  { offset: 0, label: 'Local Dev Sandbox', isPublicDay: false, isTourDay: false },
  { offset: 7, label: 'Dry Run #1', isPublicDay: false, isTourDay: false },
  { offset: 14, label: 'Dry Run #2', isPublicDay: false, isTourDay: false },
  { offset: 21, label: 'Sec 4 Tour Day 1', isPublicDay: false, isTourDay: true },
  { offset: 22, label: 'Sec 4 Tour Day 2 / Open House Day 1', isPublicDay: true, isTourDay: true },
  {
    offset: 23,
    label: 'Sec 4 Tour Day 3 / Open House Day 2 / Discovery Evening',
    isPublicDay: true,
    isTourDay: true,
  },
  { offset: 24, label: 'Open House Day 3', isPublicDay: true, isTourDay: false },
] as const;

export const SHIFT_TEMPLATES = [
  { code: 'MORNING', label: 'Morning', startLocal: '09:30', endLocal: '14:00' },
  { code: 'AFTERNOON', label: 'Afternoon', startLocal: '13:30', endLocal: '18:00' },
] as const;

export const CATEGORIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'SEC_1', label: 'Sec 1' },
  { code: 'SEC_2', label: 'Sec 2' },
  { code: 'SEC_3', label: 'Sec 3' },
  { code: 'SEC_4', label: 'Sec 4' },
  { code: 'SEC_5', label: 'Sec 5' },
  { code: 'GRADUATED_AWAITING_RESULTS', label: 'Graduated, awaiting results' },
  { code: 'PARENT_GUARDIAN', label: 'Parent / Guardian' },
  { code: 'OTHER', label: 'Other' },
];

export interface FixtureStation {
  code: string;
  name: string;
  kind: StationKind;
  courseCode?: CourseCode;
  floor: string;
  countsEntry: boolean;
  issuesStamp: boolean;
  sortOrder: number;
}

/** The working station list (slide 28); counted rooms and stamping points as flags. */
export const STATIONS: readonly FixtureStation[] = [
  {
    code: 'SIGNUP_BOOTH',
    name: 'Sign-Up Booth',
    kind: 'SIGNUP_BOOTH',
    floor: 'L1',
    countsEntry: false,
    issuesStamp: false,
    sortOrder: 10,
  },
  {
    code: 'WELCOME_LOUNGE',
    name: 'Welcome Lounge',
    kind: 'WELCOME_LOUNGE',
    floor: 'L1',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 20,
  },
  {
    code: 'DAAA_STATION',
    name: 'DAAA Station',
    kind: 'COURSE_STATION',
    courseCode: 'DAAA',
    floor: 'L2',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 30,
  },
  {
    code: 'DCDF_STATION',
    name: 'DCDF Station',
    kind: 'COURSE_STATION',
    courseCode: 'DCDF',
    floor: 'L2',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 40,
  },
  {
    code: 'DCS_STATION',
    name: 'DCS Station',
    kind: 'COURSE_STATION',
    courseCode: 'DCS',
    floor: 'L3',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 50,
  },
  {
    code: 'MISSION_COMPLETE',
    name: 'Mission Complete Area',
    kind: 'MISSION_COMPLETE',
    floor: 'L1',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 60,
  },
  {
    code: 'WELCOME_PARTY',
    name: 'Welcome Party',
    kind: 'WELCOME_PARTY',
    floor: 'L1',
    countsEntry: false,
    issuesStamp: false,
    sortOrder: 70,
  },
  {
    code: 'T19_FOYER',
    name: 'T19 Foyer',
    kind: 'OTHER',
    floor: 'L1',
    countsEntry: false,
    issuesStamp: false,
    sortOrder: 80,
  },
];

export const COURSE_TAGS: ReadonlyArray<{ code: CourseCode; label: string }> = [
  { code: 'DAAA', label: 'Applied AI and Analytics' },
  { code: 'DCDF', label: 'Cybersecurity and Digital Forensics' },
  { code: 'DCS', label: 'Computer Science' },
  { code: 'DCITP', label: 'Common ICT Programme' },
];

export const GIFT_TYPES = [
  { name: 'SoC Tote Bag', initialStock: 800, lowStockThreshold: 100 },
  { name: 'SoC Water Bottle', initialStock: 500, lowStockThreshold: 75 },
  { name: 'Mission Complete Badge', initialStock: 1200, lowStockThreshold: 150 },
] as const;

export interface FixturePerson {
  email: string;
  displayName: string;
  role: CommitteeRole;
  portfolio: string | null;
}

/** One volunteer per role, so the capability matrix can be exercised by hand. */
export const PEOPLE: readonly FixturePerson[] = [
  { email: 'admin@spoh2027.test', displayName: 'Ada Admin', role: 'ADMIN', portfolio: null },
  {
    email: 'lead@spoh2027.test',
    displayName: 'Lee Lead',
    role: 'LEAD',
    portfolio: 'Comms & Outreach',
  },
  {
    email: 'chief@spoh2027.test',
    displayName: 'Chen Chief',
    role: 'CHIEF_COORDINATOR',
    portfolio: null,
  },
  {
    email: 'dc@spoh2027.test',
    displayName: 'Dana Deputy',
    role: 'DEPUTY_COORDINATOR',
    portfolio: 'Operations & Crowd Management',
  },
  { email: 'ic@spoh2027.test', displayName: 'Ivan IC', role: 'IC', portfolio: null },
  { email: 'booth@spoh2027.test', displayName: 'Bea Booth', role: 'VOLUNTEER', portfolio: null },
  {
    email: 'counter@spoh2027.test',
    displayName: 'Cal Counter',
    role: 'VOLUNTEER',
    portfolio: null,
  },
];

/** Who reports to whom, so `GET /me` returns a usable escalation chain. */
export const REPORTING: ReadonlyArray<[subordinate: string, manager: string]> = [
  ['booth@spoh2027.test', 'ic@spoh2027.test'],
  ['counter@spoh2027.test', 'ic@spoh2027.test'],
  ['ic@spoh2027.test', 'dc@spoh2027.test'],
  ['dc@spoh2027.test', 'chief@spoh2027.test'],
];

/** Which station each person works, both shifts, every day. */
export const ASSIGNMENTS: ReadonlyArray<{ email: string; stationCode: string; roleLabel: string }> =
  [
    { email: 'booth@spoh2027.test', stationCode: 'SIGNUP_BOOTH', roleLabel: 'Registration' },
    { email: 'counter@spoh2027.test', stationCode: 'DCDF_STATION', roleLabel: 'Counter' },
    { email: 'ic@spoh2027.test', stationCode: 'SIGNUP_BOOTH', roleLabel: 'Booth IC' },
  ];

/**
 * A second event beside the first (P09.8): one booth, one day, and a person
 * on both rosters — a volunteer in the first, the booth IC in the second.
 */
export const SECOND_EVENT = {
  id: 'evt_seed_dry_run',
  slug: 'dry-run',
  name: 'Dry Run',
  dayOffset: 40,
  dayLabel: 'Dry-run day',
  station: { code: 'DRY_RUN_BOOTH', name: 'Dry-run booth' },
  person: { email: 'multi@spoh2027.test', displayName: 'Mo Multi' },
} as const;
