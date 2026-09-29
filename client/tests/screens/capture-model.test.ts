import { describe, expect, it } from 'vitest';
import {
  adjustGroup,
  groupMembers,
  groupTotal,
  type GroupCounts,
} from '@/features/registration/model/groupMembers';
import { decodedCardCode } from '@/features/capture/model/decodedCardCode';
import { stampMessage } from '@/features/cards/model/stampMessage';
describe('group composition', () => {
  it('clamps removals at zero and removes empty categories without mutating its input', () => {
    const counts: GroupCounts = { SEC_1: 1, PARENT_GUARDIAN: 2 };
    expect(adjustGroup(counts, 'SEC_1', -2)).toEqual({ PARENT_GUARDIAN: 2 });
    expect(counts).toEqual({ SEC_1: 1, PARENT_GUARDIAN: 2 });
    expect(adjustGroup({}, 'SEC_1', -1)).toEqual({});
    expect(adjustGroup(counts, 'SEC_1', 1)).toEqual({ SEC_1: 2, PARENT_GUARDIAN: 2 });
  });
  it('totals members and preserves insertion order while excluding empty counts', () => {
    const counts: GroupCounts = { PARENT_GUARDIAN: 2, SEC_4: 3, OTHER: 0, SEC_1: undefined };
    expect(groupTotal(counts)).toBe(5);
    expect(groupMembers(counts)).toEqual([
      { category: 'PARENT_GUARDIAN', count: 2 },
      { category: 'SEC_4', count: 3 },
    ]);
    expect(groupTotal({})).toBe(0);
    expect(groupMembers({})).toEqual([]);
  });
});
describe('scan decoding', () => {
  it.each([
    [' abc234 ', 'ABC234'],
    // A bare code is read with the printed alphabet's rule (F03-020).
    [' abcl2o ', 'ABC120'],
    ['spoh2027:abc234more', 'ABC234'],
    ['prefix:other:xyz987', 'XYZ987'],
    ['abcdefghi', 'ABCDEF'],
    ['', ''],
    ['prefix:', ''],
    ['abc', 'ABC'],
    ['i0o123', '100123'],
  ])('reads %s as %s', (text, code) => expect(decodedCardCode(text)).toBe(code));
});
describe('stamp feedback', () => {
  it('prioritizes completed journeys over the stamp result', () => {
    expect(stampMessage({ justCompleted: true, stampAdded: true, warning: 'ignored' })).toEqual({
      tone: 'ok',
      text: 'Journey complete — send them to Mission Complete.',
    });
  });
  it('confirms an added stamp and preserves duplicate warnings including empty text', () => {
    expect(stampMessage({ justCompleted: false, stampAdded: true, warning: null })).toEqual({
      tone: 'ok',
      text: 'Stamped.',
    });
    expect(stampMessage({ justCompleted: false, stampAdded: false, warning: null })).toEqual({
      tone: 'warn',
      text: 'Already stamped here.',
    });
    expect(stampMessage({ justCompleted: false, stampAdded: false, warning: 'duplicate' })).toEqual(
      { tone: 'warn', text: 'duplicate' },
    );
    expect(stampMessage({ justCompleted: false, stampAdded: false, warning: '' })).toEqual({
      tone: 'warn',
      text: '',
    });
  });
});
