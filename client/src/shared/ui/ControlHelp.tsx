import type { ReactNode } from 'react';
import { AppLink } from '@/shared/lib/AppLink';

export function ControlHelp({ children, topic, id }: { children: ReactNode; topic?: string; id?: string }): ReactNode {
  return <p id={id} className="mt-xs text-caption text-text-muted">{children}{topic ? <> <AppLink href={`/help#${topic}`} className="text-primary underline">Learn more</AppLink></> : null}</p>;
}

export function CountHelp({ topic = 'three-counts' }: { topic?: string }): ReactNode {
  return <AppLink href={`/help#${topic}`} className="text-caption text-primary underline">What this count means</AppLink>;
}
