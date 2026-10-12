'use client';
import { useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { AppLink } from '@/shared/lib/AppLink';
import { Card, Stack } from '@/shared/ui';
import { GLOSSARY } from '../model/glossary';

export default function HelpScreen() {
  const session = useRequireSession();
  if (!session) return null;
  return <AppShell title="Help and count glossary" back={{ href: '/home', label: 'Home' }}>
    <Stack>
      <nav aria-label="Help topics" className="flex flex-wrap gap-sm">
        {GLOSSARY.map((topic) => <AppLink key={topic.id} href={`/help#${topic.id}`} className="text-primary underline">{topic.title}</AppLink>)}
      </nav>
      {GLOSSARY.map((topic) => <Card key={topic.id} as="section" id={topic.id} className="scroll-mt-32">
        <h2 className="text-tagline font-semibold">{topic.title}</h2>
        <p className="mt-sm">{topic.text}</p>
      </Card>)}
    </Stack>
  </AppShell>;
}
