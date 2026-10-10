import { useAllows } from '@/features/session';
import { NAV_REGISTRY, isVisible } from '@/navigation';
import { useAppPathname } from '@/shared/lib/appPath';
import { ButtonLink } from '@/shared/ui';

export function EventWorkspaceNav() {
  const allows = useAllows();
  const pathname = useAppPathname();
  const links = NAV_REGISTRY.filter(
    (entry) => entry.surfaces?.includes('workspace') && isVisible(entry, { allows }),
  ).sort((left, right) => (left.workspaceOrder ?? 99) - (right.workspaceOrder ?? 99));
  if (!allows('Settings.Read')) return null;
  return (
    <nav aria-label="Event workspace" className="flex flex-wrap gap-xs border-b border-line pb-sm">
      {links.map((entry) => (
        <ButtonLink
          key={entry.path}
          href={entry.path}
          variant="quiet"
          size="sm"
          aria-current={pathname === entry.path ? 'page' : undefined}
        >
          {entry.workspaceLabel ?? entry.label}
        </ButtonLink>
      ))}
    </nav>
  );
}
