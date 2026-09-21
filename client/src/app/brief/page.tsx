'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, CardTitle, Section, Stack } from '@/components/ui';
import { COURSES, ESCALATION_SCRIPT, FIVE_THINGS } from '@/content/brief';
import { useRequireSession } from '@/features/session/useSession';

/**
 * "What do I say" (PRODUCT_BRIEF §1.1).
 *
 * Course one-liners short enough to actually be repeated, the questions
 * visitors keep asking, and the escalation script — which exists so that not
 * knowing stops feeling like a failure and starts being the correct answer.
 *
 * The escalation script leads, because it is the one thing on the screen a
 * volunteer needs while a visitor is standing in front of them.
 */
export default function BriefPage(): ReactNode {
  const session = useRequireSession();
  if (!session) return null;

  return (
    <AppShell title="What do I say" back={{ href: '/home', label: 'Home' }}>
      <Stack>
        <Card tone="info">
          <CardTitle>If you do not know</CardTitle>
          {/* Read aloud to a visitor, so it keeps design.md's reading pace. */}
          <p className="mt-xs text-reading">{ESCALATION_SCRIPT}</p>
        </Card>

        <Section title="The courses, in one line each">
          <div className="flex flex-col gap-xs">
            {COURSES.map((course) => (
              <Card as="details" variant="flat" key={course.code}>
                <summary className="flex cursor-pointer list-none items-baseline gap-xs marker:content-none transition-colors hover:text-primary">
                  <span aria-hidden="true" className="text-primary">
                    ▸
                  </span>
                  <span className="font-semibold">{course.code}</span>
                  <span className="min-w-0 text-caption text-text-muted">{course.name}</span>
                </summary>

                <p className="mt-sm text-reading">{course.oneLiner}</p>

                <dl className="mt-sm flex flex-col gap-xs">
                  {course.askedOften.map((item) => (
                    <div key={item.question}>
                      <dt className="font-semibold">{item.question}</dt>
                      <dd className="text-reading text-text-muted">{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="The five things">
          <Card>
            <ol className="flex list-decimal flex-col gap-xs pl-lg text-reading">
              {FIVE_THINGS.map((thing) => (
                <li key={thing}>{thing}</li>
              ))}
            </ol>
          </Card>
        </Section>

        <p className="text-caption text-text-muted">
          Draft content, pending sign-off by the Chief Coordinator and the course leads before the 4
          November training.
        </p>
      </Stack>
    </AppShell>
  );
}
