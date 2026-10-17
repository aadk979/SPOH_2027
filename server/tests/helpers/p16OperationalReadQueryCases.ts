import { z } from 'zod';
import definitions from '../fixtures/p16-operational-read-query-cases.json' with { type: 'json' };

const Family = z.enum(['people', 'audit', 'incidents', 'station-roster']);
export type QueryFamily = z.infer<typeof Family>;
export type QueryTransport = Record<string, string | string[]>;
const Case = z
  .object({
    id: z.string(),
    family: Family,
    field: z.string().optional(),
    query: z.record(z.string(), z.union([z.string(), z.array(z.string()).length(2)])),
  })
  .strict();
const Corpus = z
  .object({
    invalid: z.array(Case),
    valid: z.array(Case),
    routeFamilies: z.array(Family),
    transportValues: z.string(),
    noBusinessMutationRequests: z.literal(true),
  })
  .strict();
const parsed = Corpus.parse(definitions);
export function operationalReadQueryCases(hydration: {
  stationId: string;
  eventDayId: string;
  personId: string;
  announcementId: string;
  now: string;
}) {
  const tokens: Record<string, string> = {
    __P16_STATION_ID__: hydration.stationId,
    __P16_EVENT_DAY_ID__: hydration.eventDayId,
    __P16_PERSON_ID__: hydration.personId,
    __P16_ANNOUNCEMENT_ID__: hydration.announcementId,
    __P16_NOW__: hydration.now,
  };
  const expand = (row: z.infer<typeof Case>) => {
    const query: QueryTransport = {};
    for (const [key, value] of Object.entries(row.query))
      query[key] = Array.isArray(value)
        ? value.map((item) => tokens[item] ?? item)
        : (tokens[value] ?? value);
    return { ...row, query };
  };
  return { ...parsed, invalid: parsed.invalid.map(expand), valid: parsed.valid.map(expand) };
}
