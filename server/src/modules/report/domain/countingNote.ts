/**
 * The post-event report (PRODUCT_BRIEF §10).
 *
 * Generated, not assembled. Everything the deck asks each IC to consolidate —
 * slides 13, 28, 34, 43, 47 and 48 — comes out of one call.
 *
 * Two properties make it trustworthy:
 *
 *  - The three counts stay separate all the way to the export, each labelled
 *    with its unit, and the report opens with a note in prose explaining that
 *    they are not the same people counted three ways.
 *
 *  - The data-integrity section lists every fallback window, the split by
 *    source, and the voided rows. A reader can see exactly which hours are
 *    approximate without asking anybody.
 */

/**
 * The sentence at the top of every report.
 *
 * The single most likely misreading of this document is that registrations,
 * room entries and cards describe the same people. Saying so once, in words,
 * at the top, is cheaper than a footnote nobody reaches.
 */
export const COUNTING_NOTE =
  'This report contains three separate counts, which measure different things and must not be added together. ' +
  'REGISTRATIONS counts people who signed up at the booth. ROOM ENTRIES counts bodies passing through a doorway, ' +
  'so one visitor who enters four rooms is four entries. CARDS counts Mission Card journeys, and one card may ' +
  'represent a whole family. There is no single "total visitors" figure, because there is no honest way to produce one.';
