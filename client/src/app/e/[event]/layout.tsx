import type { ReactNode } from 'react';
import { EventLayout } from '@/features/events';

/**
 * Event screens (ADR-001 §5). The static export renders this segment once,
 * for the placeholder `_`, and the server serves every `/e/<slug>/…` from it
 * (ADR-008 §2); the real slug is read in the browser (`useEventSlug`).
 */
export function generateStaticParams(): Array<{ event: string }> {
  return [{ event: '_' }];
}

export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return <EventLayout>{children}</EventLayout>;
}
