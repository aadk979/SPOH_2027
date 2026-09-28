export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** A second line, `list` layout only. Explains what picking this means. */
  hint?: string;
  disabled?: boolean;
}
