'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { COURSES, ESCALATION_SCRIPT, FIVE_THINGS } from '@/content/brief';
import { useRequireSession } from '@/features/session/useSession';

/**
 * "What do I say" (PRODUCT_BRIEF §1.1).
 *
 * Course one-liners short enough to actually be repeated, the questions
 * visitors keep asking, and the escalation script — which exists so that not
 * knowing stops feeling like a failure and starts being the correct answer.
 */
export default function BriefPage(): ReactNode {
  const session = useRequireSession();
  if (!session) return null;

  return (
    <AppShell title="What do I say" back={{ href: '/home', label: 'Home' }}>
      <section className="tile mb-6">
        <h2 className="mb-2 text-xl font-semibold">If you do not know</h2>
        <p style={{ fontSize: 'var(--text-body)' }}>{ESCALATION_SCRIPT}</p>
      </section>

      <h2
        className="mb-3 text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        The courses, in one line each
      </h2>

      <div className="mb-6 flex flex-col gap-3">
        {COURSES.map((course) => (
          <details key={course.code} className="tile-flat">
            <summary className="cursor-pointer">
              <span className="font-semibold">{course.code}</span>
              <span className="ml-2" style={{ color: 'var(--text-muted)' }}>
                {course.name}
              </span>
            </summary>
            <p className="mt-3">{course.oneLiner}</p>
            <dl className="mt-3 flex flex-col gap-2">
              {course.askedOften.map((item) => (
                <div key={item.question}>
                  <dt className="font-semibold">{item.question}</dt>
                  <dd style={{ color: 'var(--text-muted)' }}>{item.answer}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>

      <h2
        className="mb-3 text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        The five things
      </h2>
      <ol className="tile flex list-decimal flex-col gap-2 pl-5">
        {FIVE_THINGS.map((thing) => (
          <li key={thing}>{thing}</li>
        ))}
      </ol>

      <p className="mt-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Draft content, pending sign-off by the Chief Coordinator and the course leads before the 4
        November training.
      </p>
    </AppShell>
  );
}
