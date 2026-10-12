import type { RecordsResponse } from '@spoh/shared';
import { AppLink } from '@/shared/lib/AppLink';
import { entityPath } from '@/shared/lib/workspacePath';
import { Card, Callout, EmptyState, Stack } from '@/shared/ui';
import { aggregateLabel, filterDescription } from '../model/presentation';
import { WorkspaceFields } from './WorkspaceFields';
import { WorkspaceLinks } from './WorkspaceLinks';

export function RecordsContents({ pages }: { pages: RecordsResponse[] }) {
  const first = pages[0];
  if (!first) return null;
  const rows = pages.flatMap((page) => page.data);
  return <Stack>
    <Callout title={aggregateLabel(first.aggregate)}>
      <p>{first.meta.count.toLocaleString()} records match these filters. {rows.length.toLocaleString()} shown.</p>
      {first.aggregate.balance !== undefined ? <p>Pool balance: {first.aggregate.balance.toLocaleString()}</p> : null}
      {first.aggregate.openingStock !== undefined ? <p>Opening stock: {first.aggregate.openingStock.toLocaleString()}</p> : null}
      {first.aggregate.explanation ? <p>{first.aggregate.explanation}</p> : null}
    </Callout>
    <details><summary className="min-h-control cursor-pointer font-semibold">Applied filters and observation</summary>
      <dl className="grid gap-xs text-caption sm:grid-cols-2">
        <div><dt>Observed at</dt><dd className="break-words">{first.asOf}</dd></div>
        {filterDescription(first.filter).map((filter) => <div key={filter.label}><dt>{filter.label}</dt><dd className="break-words">{filter.value}</dd></div>)}
      </dl>
    </details>
    {!rows.length ? <EmptyState title="No matching records">Try a different observation from the source page.</EmptyState> : null}
    <ul className="flex flex-col gap-sm">{rows.map((row) => <li key={row.id}><Card>
      <h2 className="mb-sm font-semibold">{row.destination ? <AppLink className="text-primary underline" href={entityPath(row.destination)}>{row.title}</AppLink> : row.title}</h2>
      <WorkspaceFields fields={row.fields} />
      <WorkspaceLinks links={row.related} label={`Related to ${row.title}`} />
    </Card></li>)}</ul>
  </Stack>;
}
