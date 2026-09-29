import type { Tone } from '@/shared/ui';

/** A printed QR that could not be resolved: offline, or not one of ours (F03-045). */
export const UNRESOLVED_SCAN: { tone: Tone; text: string } = {
  tone: 'warn',
  text: 'That QR could not be looked up. Type the six-character code printed under it.',
};
