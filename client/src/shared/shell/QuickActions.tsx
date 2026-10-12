'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NAV_REGISTRY, isVisible, type NavContext, type NavEntry } from '@/navigation';
import { useAllows, useMe } from '@/features/session';
import { AppLink } from '@/shared/lib/AppLink';
import { useAppRouter } from '@/shared/lib/appPath';
import { useOptionalEvent } from '@/shared/lib/eventContext';
import { searchPath } from '@/shared/lib/workspacePath';
import { Button, Field, Input } from '@/shared/ui';

export function QuickActions() {
  const [open, setOpen] = useState(false);
  const event = useOptionalEvent();
  useEffect(() => {
    const shortcut = (key: KeyboardEvent) => {
      if ((key.ctrlKey || key.metaKey) && key.key.toLowerCase() === 'k') {
        key.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
      className="min-h-control shrink-0 px-xs text-on-dark" title="Quick actions (Ctrl or Command K)">Tools</button>
    {open ? event ? <EventQuickActions onClose={() => setOpen(false)} /> : <QuickDialog onClose={() => setOpen(false)}>
      <AppLink href="/events" className="min-h-control text-primary underline">Your events</AppLink>
      <AppLink href="/notifications" className="min-h-control text-primary underline">Notifications</AppLink>
    </QuickDialog> : null}
  </>;
}

function EventQuickActions({ onClose }: { onClose: () => void }) {
  const allows = useAllows();
  const { data: me, error } = useMe();
  const context = { allows, station: me?.currentAssignment?.station };
  const entries = NAV_REGISTRY.filter((entry) => quickEntryVisible(entry, context, !!error));
  return <QuickDialog onClose={onClose}>
    <QuickSearch onClose={onClose} />
    <nav aria-label="Quick actions"><ul className="grid gap-xs sm:grid-cols-2">
      {entries.map((entry) => <li key={entry.path}><AppLink href={entry.path} onClick={onClose}
        className="inline-flex min-h-control items-center text-primary underline">{entry.label}</AppLink></li>)}
    </ul></nav>
  </QuickDialog>;
}

const DESTINATIONS_ONLY = new Set(['/', '/sign-in', '/mfa', '/entity', '/records', '/tv']);
function quickEntryVisible(entry: NavEntry, context: NavContext, denied: boolean) {
  if (DESTINATIONS_ONLY.has(entry.path) || entry.path.startsWith('/capture/')) return false;
  return (!denied || !entry.requires) && isVisible(entry, context);
}

function QuickSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const router = useAppRouter();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    onClose();
    router.push(searchPath(query.trim()));
  };
  return <form role="search" onSubmit={submit} className="mb-lg flex flex-col gap-sm">
    <Field id="quick-search" label="Search this event" hint="Names, station codes and card codes; current access applies.">
      {(props) => <Input {...props} type="search" maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} />}
    </Field><Button type="submit" disabled={!query.trim()}>Search</Button>
  </form>;
}

function QuickDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const target = dialog.current;
    const origin = document.activeElement;
    if (typeof target?.showModal === 'function') target.showModal();
    else target?.setAttribute('open', '');
    close.current?.focus();
    return () => {
      target?.close?.();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-label="Tools and search" aria-modal="true"
    className="m-auto max-h-[85dvh] w-[min(90vw,44rem)] overflow-y-auto rounded-lg border border-line bg-surface p-lg text-text backdrop:bg-black/50"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="mb-md flex items-center justify-between gap-sm"><h2 className="font-semibold">Tools and search</h2>
      <button ref={close} type="button" onClick={onClose} className="min-h-control px-sm">Close</button></div>
    {children}
  </dialog>;
}
