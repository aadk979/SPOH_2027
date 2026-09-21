'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCurrentSession } from '@/features/session/useSession';
import { canOpenOperations, sectionForPath } from '@/lib/navigation';

const items = [
  { href: '/home', label: 'Home', icon: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  { href: '/shift', label: 'My shift', icon: 'M5 5h14v16H5ZM8 2v6m8-6v6M5 11h14' },
  {
    href: '/guide',
    label: 'Guide',
    icon: 'M12 5v16M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1Z',
  },
  { href: '/safety', label: 'Safety', icon: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM12 7v6m0 3v1' },
  { href: '/operations', label: 'Operations', icon: 'M4 21V11h4v10m2 0V3h4v18m2 0V7h4v14' },
];

export function SectionNav() {
  const session = useCurrentSession();
  const active = sectionForPath(usePathname());
  return (
    <nav aria-label="Main sections" className="section-nav">
      <p className="section-nav-caption">Your workspace</p>
      <div className="section-nav-links">
        {items
          .filter(
            (item) => item.href !== '/operations' || canOpenOperations(session?.capabilities ?? []),
          )
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? 'page' : undefined}
              className="section-nav-link"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={item.icon} />
              </svg>
              <span>{item.label}</span>
            </Link>
          ))}
      </div>
      <div className="section-nav-note">
        <p className="font-semibold">School of Computing</p>
        <p>Open House 2027</p>
        <Link href="/safety/incident/new">
          Report an incident <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </nav>
  );
}
