'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * The one button in the app.
 *
 * Before this there were five heights (44, 48, 56, 64 and "whatever `py-5`
 * came to") and eleven hand-written colour combinations, because every screen
 * re-derived the same pill from inline styles. Anything a volunteer taps is now
 * one of these variants, which is what makes the touch targets consistent
 * rather than accidentally consistent.
 *
 * Grammar comes from design.md:
 *  - `primary`   the Action Blue pill — the single interactive colour
 *  - `secondary` the ghost pill: same shape, blue outline, transparent fill
 *  - `quiet`     the Pearl capsule for undo, cancel and other second choices
 *  - `danger` / `warn` — NOT in design.md, which has exactly one accent because
 *    it is selling objects. Raising a lost-person alert and declaring a
 *    fallback window are irreversible, floor-wide acts and must not look like
 *    "Learn more". Both always carry a verb, never colour alone.
 *
 * Every variant presses with design.md's system-wide scale — 0.97 rather than
 * 0.95, because the same class is used on a 300px-wide submit button where the
 * full shrink reads as a glitch rather than as feedback.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'quiet'
  | 'danger'
  | 'warn'
  | 'ghost'
  /**
   * Shape, size, press and disabled behaviour with no colours at all, for the
   * caller to supply. Needed because Tailwind resolves two `bg-*` utilities by
   * their order in the generated stylesheet, not by their order in the class
   * attribute — so a `className` cannot reliably override a variant's fill.
   *
   * One legitimate user: the lost-person banner, whose buttons sit on red and
   * therefore belong to neither the light canvas nor the dark tile. Reach for a
   * real variant before this.
   */
  | 'unstyled';

/**
 * `md` is the default and clears the 44px WCAG target on its own. `lg` is for
 * a screen's single committing action — submit, declare, alert — where the
 * volunteer is looking at the phone and there is exactly one right answer.
 */
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BASE =
  'inline-flex items-center justify-center gap-xs rounded-pill border text-center font-semibold ' +
  'no-underline transition-[transform,background-color,border-color,opacity] duration-75 ' +
  'ease-[cubic-bezier(0.2,0,0.2,1)] active:scale-[0.97] ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none ' +
  'aria-disabled:opacity-45 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary border-transparent hover:bg-primary-focus',
  secondary: 'bg-transparent text-primary border-primary hover:bg-primary/10',
  quiet: 'bg-surface-sunken text-text-muted border-line hover:bg-surface-alt hover:text-text',
  danger: 'bg-alert-solid text-on-alert border-transparent hover:bg-alert-solid/90',
  warn: 'bg-warn-solid text-on-warn border-transparent hover:bg-warn-solid/90',
  ghost: 'bg-transparent text-primary border-transparent hover:bg-primary/10',
  unstyled: '',
};

/**
 * Heights are floors, not fixed values: a label that wraps on a narrow phone
 * must grow the button rather than spill out of it.
 *
 * They come from `--spacing-control*`, which is 36/44/52 under a thumb and
 * 28/34/40 under a mouse. A 44px pill is the WCAG floor on a phone and simply
 * bulk on a laptop, and applying the phone number to both is what made the
 * console look inflated.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-control-sm px-sm py-xxs text-caption',
  md: 'min-h-control px-md py-xs text-body',
  lg: 'min-h-control-lg px-lg py-sm text-body',
  /**
   * A control whose whole label is one glyph — the group-registration steppers.
   * Equal width and height against the shared pill radius makes it a circle,
   * which is design.md's `button-icon-circular`.
   *
   * Fixed at 56px and NOT compressed for a mouse: this one lives on a capture
   * screen, where the device is a thumb whatever the browser reports. The real
   * name always comes from `aria-label`; the glyph is decoration.
   */
  icon: 'size-[56px] shrink-0 px-0 text-lead leading-none',
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fills the row. Use for a screen's committing action, not for toolbars. */
  block?: boolean;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>): ReactNode {
  return (
    <button
      // Explicit, because a bare `<button>` inside a form submits it, and the
      // toggle chips on the incident and fallback screens live inside forms.
      type={type}
      className={cx(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className)}
      {...rest}
    />
  );
}

/**
 * The same grammar as a link.
 *
 * A navigation that looks like a button must still be an anchor: a volunteer
 * long-pressing "Report a lost person" to open it in a second tab, and every
 * screen reader that lists a page's links, both depend on it.
 */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  ...rest
}: CommonProps & { href: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'href'
  >): ReactNode {
  const isDisabled = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
  const classes = cx(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className);
  const tabIndex = isDisabled ? -1 : rest.tabIndex;
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    rest.onClick?.(e);
  };

  // `tel:` never goes through the router — it hands off to the dialer, and
  // Next's client-side navigation would swallow it.
  if (!href.startsWith('/') || isDisabled) {
    return (
      <a
        href={isDisabled ? undefined : href}
        className={classes}
        {...rest}
        tabIndex={tabIndex}
        onClick={handleClick}
      />
    );
  }

  return <Link href={href} className={classes} {...rest} tabIndex={tabIndex} onClick={handleClick} />;
}
