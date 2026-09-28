import type { ReactNode } from 'react';
import Link from 'next/link';
import { cx } from '@/shared/ui/cx';
export function AppHeader({
  container,
  parent,
  title,
  actions,
}: {
  container: string;
  parent: { href: string; label: string } | undefined;
  title: string;
  actions: ReactNode;
}): ReactNode {
  return (
    <div
      className={cx(
        'workspace-titlebar border-b border-line bg-surface-alt',
        'supports-[backdrop-filter:blur(1px)]:bg-surface-alt/80',
        'supports-[backdrop-filter:blur(1px)]:backdrop-blur-[20px]',
        'supports-[backdrop-filter:blur(1px)]:backdrop-saturate-[180%]',
      )}
    >
      <div className={cx(container, 'flex min-h-subnav items-center justify-between gap-sm py-xs')}>
        <div className="flex min-w-0 items-center gap-sm">
          {parent ? (
            <Link
              href={parent.href}
              className="inline-flex min-h-[44px] shrink-0 items-center px-xs -ml-xs text-caption font-medium text-primary no-underline transition-colors hover:text-primary-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
              // The arrow is punctuation, not a word: without this a screen
              // reader announces "left arrow Home" on every single screen.
            >
              <span aria-hidden="true">← </span>
              <span className="max-w-[14ch] truncate sm:max-w-[none]">{parent.label}</span>
            </Link>
          ) : null}

          <h1 className="min-w-0 truncate text-tagline">{title}</h1>
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-sm">{actions}</div> : null}
      </div>
    </div>
  );
}
