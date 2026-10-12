import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { Callout, Card, CardTitle } from '@/shared/ui';
import { useAllows } from '@/features/session';
import { AppLink } from '@/shared/lib/AppLink';
import { workspacePath } from '@/shared/lib/workspacePath';
import { attentionProblems } from '../model/attentionProblems';
export function AttentionPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  const problems = attentionProblems(data);
  const allows = useAllows();
  if (!problems.length) return <Callout tone="ok">{data.dataHealth.withinEventHours ? 'Every counted room is reporting. Nothing needs attention.' : 'Outside event hours. Silence is expected.'}</Callout>;
  return <Card tone={problems.some((problem) => problem.tone === 'alert') ? 'alert' : 'warn'}>
    <CardTitle>Needs attention</CardTitle>
    <ul className="mt-xs flex flex-col gap-xxs">{problems.map((problem) => <li key={`${problem.kind}:${problem.text}`} className={problem.tone === 'alert' ? 'text-alert' : 'text-warn'}>
      <span aria-hidden="true" className="mr-xs">{problem.tone === 'alert' ? '■' : '▲'}</span>
      {problem.target && allows(problem.action) ? <AppLink href={workspacePath(problem.target)} className="underline">{problem.text}</AppLink> : problem.text}
    </li>)}</ul>
  </Card>;
}
