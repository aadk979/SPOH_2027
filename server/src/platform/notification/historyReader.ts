import type { ReadContext } from '../access/currentRead.js';

/** A compatibility reader materialises eligible source IDs, never historical pushes. */
export type NoticeHistoryReader = (context: ReadContext) => Promise<{ complete: boolean }>;
