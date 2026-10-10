import type { ReactNode } from 'react';
import type { EventContent } from '@spoh/shared';
import { Card, CardTitle, Section, Stack } from '@/shared/ui';
export function ContentPreview({ body }: { body: EventContent }): ReactNode {
  return (
    <Section title="Guide preview">
      <Stack>
        <Card>
          <CardTitle>What do I say</CardTitle>
          <p>{body.brief.escalationScript}</p>
          <ol className="list-decimal pl-lg">
            {body.brief.fiveThings.map((item, i) => (
              <li key={i}>{item.text}</li>
            ))}
          </ol>
          {body.brief.programmes.map((programme, i) => (
            <div key={i}>
              <p>{programme.oneLiner}</p>
              <dl>
                {programme.faqs.map((faq, n) => (
                  <div key={n}>
                    <dt>{faq.question}</dt>
                    <dd>{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Card>
        <Card>
          <CardTitle>Visitor journey</CardTitle>
          <ol className="list-decimal pl-lg">
            {body.journey.steps.map((step, i) => (
              <li key={i}>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </li>
            ))}
          </ol>
          <p>{body.journey.note}</p>
        </Card>
        <Card>
          <CardTitle>Floor map</CardTitle>
          <p>{body.map.intro}</p>
          {body.map.levels.map((floor, i) => (
            <section key={i}>
              <h3>{floor.label}</h3>
              <ul>
                {floor.points.map((point, n) => (
                  <li key={n}>
                    {point.label} · {point.kind}
                  </li>
                ))}
              </ul>
              {floor.image ? <p>Floor plan: {floor.image.alt}</p> : null}
            </section>
          ))}
        </Card>
        <Card>
          <CardTitle>Before each shift</CardTitle>
          <ul>
            {body.briefing.mandatoryPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </Card>
      </Stack>
    </Section>
  );
}
