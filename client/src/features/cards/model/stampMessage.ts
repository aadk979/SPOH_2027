import type { StampCardResponse } from '@spoh/shared';
import type { Tone } from '@/shared/ui';
export function stampMessage(
  result: Pick<StampCardResponse, 'justCompleted' | 'stampAdded' | 'warning'>,
): { tone: Tone; text: string } {
  return result.justCompleted
    ? { tone: 'ok', text: 'Journey complete — send them to Mission Complete.' }
    : result.stampAdded
      ? { tone: 'ok', text: 'Stamped.' }
      : { tone: 'warn', text: result.warning ?? 'Already stamped here.' };
}
