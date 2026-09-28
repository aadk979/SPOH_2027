import type { RuntimeSettings } from '@spoh/shared';
import { NUMERIC_FIELDS, type FieldSpec } from './numericFields';

interface ShiftBlock {
  start: string;
  end: string;
}
export interface SettingsDraft {
  eventName: string;
  draft: Record<string, string>;
  morning: ShiftBlock;
  afternoon: ShiftBlock;
}
type PatchResult = { patch: Partial<RuntimeSettings> } | { error: string };

function validateNumber(field: FieldSpec, raw: string): string | null {
  if (!raw) return `${field.label} cannot be empty.`;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < field.min || value > field.max) {
    return `${field.label} must be a number between ${field.min} and ${field.max} ${field.unit}.`;
  }
  if (field.key !== 'implausibleTapsPerMinute' && !Number.isInteger(value)) {
    return `${field.label} must be a whole number.`;
  }
  return null;
}

function validateShiftBlocks(morning: ShiftBlock, afternoon: ShiftBlock): string | null {
  if (!morning.start || !morning.end || !afternoon.start || !afternoon.end) {
    return 'All shift block start and end times must be specified.';
  }
  if (morning.start >= morning.end) return 'Morning shift block must end after it starts.';
  if (afternoon.start >= afternoon.end) return 'Afternoon shift block must end after it starts.';
  return null;
}

/** Preserve screen validation order and the full patch, including unchanged fields. */
export function buildSettingsPatch({
  eventName,
  draft,
  morning,
  afternoon,
}: SettingsDraft): PatchResult {
  if (!eventName.trim()) return { error: 'Event name cannot be empty.' };
  if (eventName.trim().length > 80) return { error: 'Event name must be 80 characters or fewer.' };
  const patch: Record<string, unknown> = { eventName: eventName.trim() };
  for (const field of NUMERIC_FIELDS) {
    const raw = draft[field.key]?.trim() ?? '';
    const error = validateNumber(field, raw);
    if (error) return { error };
    patch[field.key] = Number(raw);
  }
  const error = validateShiftBlocks(morning, afternoon);
  if (error) return { error };
  patch.shiftBlocks = { MORNING: morning, AFTERNOON: afternoon };
  return { patch: patch as Partial<RuntimeSettings> };
}
