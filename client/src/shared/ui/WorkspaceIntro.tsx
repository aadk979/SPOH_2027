import type { ReactNode } from 'react';

export function WorkspaceIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="workspace-intro">
      <p className="text-caption font-semibold tracking-[0.1em] text-primary uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-xs text-hero">{title}</h2>
      <p className="mt-sm max-w-reading text-text-muted">{children}</p>
    </header>
  );
}
