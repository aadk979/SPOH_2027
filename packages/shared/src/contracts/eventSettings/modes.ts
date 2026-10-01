import { z } from 'zod';
import { Id } from '../common/index.js';

/** One count for the headline; counts are never summed (ADR-002 §4). */
export const HeadlineSource = z.discriminatedUnion('count', [
  z.object({ count: z.literal('registrations') }).strict(),
  z.object({ count: z.literal('footfall'), stationId: Id }).strict(),
  z.object({ count: z.literal('journeys') }).strict(),
]);
export type HeadlineSource = z.infer<typeof HeadlineSource>;

export const CountsMode = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('separate') }).strict(),
  z.object({ mode: z.literal('headline'), source: HeadlineSource }).strict(),
]);
export type CountsMode = z.infer<typeof CountsMode>;

export const VisitorDataMode = z.enum(['none', 'allowlist']);
export type VisitorDataMode = z.infer<typeof VisitorDataMode>;
