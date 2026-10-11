import type { ReactNode } from 'react';
import { Card, EmptyState, Section, Stack } from '@/shared/ui';
export function StructureCollection({
  title,
  description,
  rows,
  create,
  edit,
}: {
  title: string;
  description: string;
  rows: Array<{ id: string; label: string; detail: string }>;
  create?: ReactNode;
  edit(id: string): ReactNode;
}) {
  return (
    <Section title={title} description={description}>
      <Stack>
        {create ? (
          <Card>
            <details>
              <summary className="min-h-control cursor-pointer font-semibold">
                Add {title.toLowerCase()}
              </summary>
              <div className="mt-md">{create}</div>
            </details>
          </Card>
        ) : null}
        {rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()} yet`} /> : null}
        {rows.map((row) => (
          <Card key={row.id}>
            <details>
              <summary className="min-h-control cursor-pointer">
                <strong>{row.label}</strong>
                <span className="ml-sm text-text-muted">{row.detail}</span>
              </summary>
              <div className="mt-md">{edit(row.id)}</div>
            </details>
          </Card>
        ))}
      </Stack>
    </Section>
  );
}
