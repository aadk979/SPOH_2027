import { useAllows } from '@/features/session';
import { NavTile } from '@/shared/ui/NavTile';
import { CardGrid, Section } from '@/shared/ui';
import { NAV_REGISTRY, isVisible } from '@/navigation';

export function SetupChecklist() {
  const allows = useAllows();
  const sections = NAV_REGISTRY.filter(
    (entry) => entry.surfaces?.includes('setup') && isVisible(entry, { allows }),
  );
  return (
    <Section title="Set up this event">
      <CardGrid columns={2}>
        {sections.map((entry) => (
          <NavTile key={entry.path} href={entry.path} label={entry.label} hint={entry.hint ?? ''} />
        ))}
      </CardGrid>
    </Section>
  );
}
