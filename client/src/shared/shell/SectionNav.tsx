'use client';

import { AppLink as Link } from '@/shared/lib/AppLink';
import { useAppPathname } from '@/shared/lib/appPath';
import { useCurrentSession } from '@/features/session';
import { sectionEntries, sectionForPath } from '@/navigation';

export function SectionNav() {
  const session = useCurrentSession();
  const active = sectionForPath(useAppPathname());
  return (
    <nav aria-label="Main sections" className="section-nav">
      <p className="section-nav-caption">Your workspace</p>
      <div className="section-nav-links">
        {sectionEntries({ capabilities: session?.capabilities ?? [] }).map((item) => (
          <Link
            key={item.path}
            href={item.path}
            aria-current={active === item.path ? 'page' : undefined}
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
