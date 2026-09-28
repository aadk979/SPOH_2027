import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { Callout, Card, CardTitle } from '@/shared/ui';
import { attentionProblems } from '../model/attentionProblems';
export function AttentionPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  const problems = attentionProblems(data);

  if (problems.length === 0) {
    return (
      <Callout tone="ok">
        {data.dataHealth.withinEventHours
          ? 'Every counted room is reporting. Nothing needs attention.'
          : 'Outside event hours. Silence is expected.'}
      </Callout>
    );
  }

  return (
    <Card tone={problems.some((problem) => problem.tone === 'alert') ? 'alert' : 'warn'}>
      <CardTitle>Needs attention</CardTitle>
      <ul className="mt-xs flex flex-col gap-xxs">
        {problems.map((problem) => (
          <li key={problem.text} className={problem.tone === 'alert' ? 'text-alert' : 'text-warn'}>
            {/* An icon and words, never colour alone. */}
            <span aria-hidden="true" className="mr-xs">
              {problem.tone === 'alert' ? '■' : '▲'}
            </span>
            {problem.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
