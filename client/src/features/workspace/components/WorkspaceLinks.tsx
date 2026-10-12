import type { WorkspaceLink } from '@spoh/shared';
import { AppLink } from '@/shared/lib/AppLink';
import { workspacePath } from '@/shared/lib/workspacePath';

export function WorkspaceLinks({ links, label }: { links: WorkspaceLink[]; label: string }) {
  if (!links.length) return null;
  return <nav aria-label={label}><ul className="flex flex-wrap gap-sm">
    {links.map((link, index) => <li key={`${link.label}-${index}`}>
      <AppLink href={workspacePath(link.destination)} className="inline-flex min-h-control items-center text-primary underline">{link.label}</AppLink>
    </li>)}
  </ul></nav>;
}
