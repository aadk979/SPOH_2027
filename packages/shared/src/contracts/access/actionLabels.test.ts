import { describe, expect, it } from 'vitest';
import { ACTION_IDS, ACTION_LABELS } from '../../index.js';

describe('action labels (P11.7, P11.8)', () => {
  it('names every action once, as a lower-case verb phrase that completes "You cannot …"', () => {
    expect(Object.keys(ACTION_LABELS).sort()).toEqual([...ACTION_IDS].sort());
    for (const label of Object.values(ACTION_LABELS)) {
      expect(label).toMatch(/^[a-z]/);
      expect(label).not.toMatch(/[.!?]$/);
    }
    expect(new Set(Object.values(ACTION_LABELS)).size).toBe(ACTION_IDS.length);
  });
});
