import type { EventContent } from '@spoh/shared';
import type { FormErrors } from '@/shared/hooks/useZodForm';
export interface ContentSectionProps<Key extends keyof EventContent> {
  value: EventContent[Key];
  errors: FormErrors;
  onChange(value: EventContent[Key]): void;
}
export function replaceItem<Item>(items: Item[], index: number, value: Item): Item[] {
  return items.map((item, i) => (i === index ? value : item));
}
export const EMPTY_CONTENT: EventContent = {
  schemaVersion: 1,
  brief: { escalationScript: '', fiveThings: [{ text: '' }], programmes: [] },
  journey: { steps: [{ title: '', detail: '' }] },
  map: { intro: '', levels: [{ label: '', points: [] }] },
  briefing: { mandatoryPoints: [''] },
};
