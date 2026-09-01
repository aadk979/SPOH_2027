/**
 * Volunteer briefing content (PRODUCT_BRIEF §1.1).
 *
 * Held as data rather than markup so it can be reviewed and corrected by the
 * committee without touching a component, and so the same strings feed the
 * `FALLBACK_RunbookAndBriefing` Google Doc in Part 11.
 *
 * ⚠ PLACEHOLDER CONTENT. Everything below is a working draft written from the
 * product brief. The course one-liners, the floor detail and the escalation
 * script must be reviewed and signed off by the Chief Coordinator and the
 * course leads before the 4 Nov 2026 Student Ambassador training, which is when
 * the app goes live to volunteers.
 */

export interface CourseBlurb {
  code: string;
  name: string;
  oneLiner: string;
  askedOften: Array<{ question: string; answer: string }>;
}

export const COURSES: CourseBlurb[] = [
  {
    code: 'DCITP',
    name: 'Diploma in Infocomm Security Management',
    oneLiner:
      'Cybersecurity: how systems get attacked, and how you defend them. Hands-on from the first semester.',
    askedOften: [
      {
        question: 'Do I need to code already?',
        answer: 'No. You start from the basics; what matters is being willing to problem-solve.',
      },
    ],
  },
  {
    code: 'DAAA',
    name: 'Diploma in Applied AI & Analytics',
    oneLiner: 'Data and AI: finding the story in the numbers and building models that act on it.',
    askedOften: [
      {
        question: 'Is it a lot of maths?',
        answer: 'There is real statistics, and it is taught from the ground up alongside the code.',
      },
    ],
  },
  {
    code: 'DCDF',
    name: 'Diploma in Computer Engineering / Digital Forensics',
    oneLiner: 'Digital forensics: recovering the evidence a device thought it had deleted.',
    askedOften: [
      {
        question: 'What jobs does this lead to?',
        answer: 'Incident response, law enforcement forensics, and security consulting.',
      },
    ],
  },
  {
    code: 'DCS',
    name: 'Diploma in Computer Science',
    oneLiner: 'Software engineering end to end: building the thing, then making it work at scale.',
    askedOften: [
      {
        question: 'Can I still go to university afterwards?',
        answer: 'Yes — plenty of graduates go on to local and overseas degrees.',
      },
    ],
  },
];

/** The escalation script, verbatim. The point is that it is short enough to use. */
export const ESCALATION_SCRIPT =
  '"That\'s a good question — I don\'t want to guess. Let me get someone who knows." Then find your IC. Nobody expects you to know everything; guessing is the only wrong answer.';

/** Slide 57, personalised per role at render time. */
export const FIVE_THINGS: string[] = [
  'Know where you are: your station, and the two nearest exits.',
  'Know who your IC is, and how to reach them in one tap.',
  'Know the visitor journey — the six steps from arrival to Mission Complete.',
  'If you do not know an answer, say so and fetch someone who does.',
  'Anything unsafe goes to your IC and into an incident report, immediately.',
];

/** The six-step visitor journey from slide 5. */
export const VISITOR_JOURNEY: Array<{ step: number; title: string; detail: string }> = [
  { step: 1, title: 'Arrive', detail: 'Visitors reach T19 and are greeted at the Welcome Party.' },
  {
    step: 2,
    title: 'Sign up',
    detail: 'One tap per person at the booth. A family gets one Mission Card between them.',
  },
  {
    step: 3,
    title: 'Welcome Lounge',
    detail: 'First stamp. Orientation to the course stations and what to see.',
  },
  {
    step: 4,
    title: 'Course stations',
    detail: 'DAAA, DCDF and DCS. A stamp at each — the stamps are the point, not the scan.',
  },
  {
    step: 5,
    title: 'Mission Complete',
    detail: 'Card is checked visually, gift redeemed, journey recorded.',
  },
  {
    step: 6,
    title: 'Leave',
    detail: 'Visitors leave with the card as a keepsake and a course in mind.',
  },
];

export interface MapFloor {
  level: string;
  points: Array<{ label: string; kind: 'station' | 'facility' | 'safety' }>;
}

/**
 * ⚠ PLACEHOLDER. The real T19 floor plan images and exact room numbers are
 * pending from the Chief Coordinator. This structure is what the map screen
 * renders; swapping in the real data is a content change, not a code change.
 */
export const FLOOR_MAP: MapFloor[] = [
  {
    level: 'Level 1',
    points: [
      { label: 'Welcome Party — T19 foyer', kind: 'station' },
      { label: 'Sign-Up Booth', kind: 'station' },
      { label: 'Welcome Lounge', kind: 'station' },
      { label: 'Mission Complete Area', kind: 'station' },
      { label: 'Toilets — beside the lift lobby', kind: 'facility' },
      { label: 'First aid kit — SoC Administration Office', kind: 'safety' },
      { label: 'AED — main lobby, by the lift', kind: 'safety' },
      { label: 'Assembly point — open plaza outside T19', kind: 'safety' },
    ],
  },
  {
    level: 'Level 2',
    points: [
      { label: 'DAAA Station', kind: 'station' },
      { label: 'DCDF Station', kind: 'station' },
      { label: 'Toilets — east wing', kind: 'facility' },
      { label: 'AED — corridor outside the lab cluster', kind: 'safety' },
      { label: 'Emergency exit — east stairwell', kind: 'safety' },
    ],
  },
  {
    level: 'Level 3',
    points: [
      { label: 'DCS Station', kind: 'station' },
      { label: 'Toilets — west wing', kind: 'facility' },
      { label: 'AED — outside the seminar room', kind: 'safety' },
      { label: 'Emergency exit — west stairwell', kind: 'safety' },
    ],
  },
];
