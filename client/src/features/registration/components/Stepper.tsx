import type { ReactNode } from 'react';
import { Button } from '@/shared/ui';
/**
 * A +/- control for one category row.
 *
 * The glyph is `aria-hidden` because the button's real name is "Add one
 * Sec 4" — a screen reader reading out "plus" tells nobody which row it
 * belongs to.
 */
export function Stepper({
  label,
  glyph,
  variant,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
  variant: 'primary' | 'quiet';
  onClick(): void;
  disabled?: boolean;
}): ReactNode {
  return (
    <Button
      variant={variant}
      size="icon"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="size-[44px] sm:size-[56px]"
    >
      <span aria-hidden="true">{glyph}</span>
    </Button>
  );
}
