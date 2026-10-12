'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { SearchRequest } from '@spoh/shared';
import { useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { useAppRouter } from '@/shared/lib/appPath';
import { AppLink } from '@/shared/lib/AppLink';
import { entityPath, searchPath } from '@/shared/lib/workspacePath';
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Stack } from '@/shared/ui';
import { routeInput, searchFromParams } from '../model/routeInput';
import { useWorkspaceSearch } from '../queries';
import { WorkspaceReadBoundary } from '../components/WorkspaceReadBoundary';

export default function SearchScreen() {
  const session = useRequireSession();
  const params = useSearchParams();
  const input = routeInput(() => searchFromParams(params));
  if (!session) return null;
  return <AppShell title="Search this event" back={{ href: '/home', label: 'Home' }}><Stack>
    {input.error ? <ErrorState error={input.error} operation="Opening this search" /> :
      <WorkspaceReadBoundary operation="Searching this event"><SearchForm initial={input.data?.query ?? ''} />
        <SearchResults input={input.data} /></WorkspaceReadBoundary>}
  </Stack></AppShell>;
}

function SearchForm({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const router = useAppRouter();
  useEffect(() => setText(initial), [initial]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) router.push(searchPath(text.trim()));
  };
  return <form role="search" onSubmit={submit} className="flex flex-col gap-sm">
    <Field id="workspace-search" label="Station, person, card or record" hint="Search within this event. Results follow your current access.">
      {(props) => <Input {...props} type="search" value={text} maxLength={120} onChange={(event) => setText(event.target.value)} />}
    </Field><Button type="submit" disabled={!text.trim()}>Search</Button>
  </form>;
}

function SearchResults({ input }: { input: SearchRequest | null }) {
  const query = useWorkspaceSearch(input);
  if (!input) return <EmptyState title="Find an event record">Enter a name, station code or card code.</EmptyState>;
  if (query.error) return <ErrorState error={query.error} operation="Searching this event" onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingRows label="Searching this event" />;
  if (!query.data.data.length) return <EmptyState title="No visible matches">Try another name or code.</EmptyState>;
  return <><p role="status">{query.data.meta.count} visible matches{query.data.meta.truncated ? '. More matches are available; narrow your search.' : '.'}</p>
    <ul className="flex flex-col gap-sm">{query.data.data.map((result) => <li key={`${result.destination.kind}:${result.destination.id}`}><Card>
      <AppLink href={entityPath(result.destination)} className="inline-flex min-h-control items-center font-semibold text-primary underline">{result.title}</AppLink>
      <p className="text-caption text-text-muted">{result.detail}</p>
    </Card></li>)}</ul></>;
}
