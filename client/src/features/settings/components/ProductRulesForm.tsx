import type { ReactNode } from 'react';
import { Card, LoadingRows, Section } from '@/shared/ui';
import { useEventSettings } from '../queries';
import { VisitorFieldEditor } from '@/features/visitor';
import { CountsModeField } from './CountsModeField';
import { LostPersonRetentionField } from './LostPersonRetentionField';
import { VisitorDataField } from './VisitorDataField';
import { ProductHistoryPanel } from './ProductHistoryPanel';

/** The event's product rules (ADR-002 §4): each saved on its own, at the version read. */
export function ProductRulesForm({
  enabled,
  canEdit,
}: {
  enabled: boolean;
  canEdit: boolean;
}): ReactNode {
  const settings = useEventSettings(enabled);
  const data = settings.data;
  return (
    <Section
      title="Counts and visitor data"
      description="How this event shows its three counts, whether it keeps anything about the visitors themselves, and how soon a lost-person description is removed."
    >
      <Card className="flex flex-col gap-lg">
        {!data ? (
          <LoadingRows />
        ) : (
          <>
            <CountsModeField
              key={`counts:${data.versions['product.countsMode']}`}
              current={data.settings['product.countsMode']}
              version={data.versions['product.countsMode']}
              canEdit={canEdit}
            />
            <VisitorDataField
              key={`visitors:${data.versions['product.visitorDataMode']}`}
              current={data.settings['product.visitorDataMode']}
              version={data.versions['product.visitorDataMode']}
              canEdit={canEdit}
            />
            <VisitorFieldEditor
              enabled={enabled && data.settings['product.visitorDataMode'] === 'allowlist'}
              canEdit={canEdit}
            />
            <LostPersonRetentionField
              key={`retention:${data.versions.lostPersonPurgeHours}`}
              current={data.settings.lostPersonPurgeHours}
              version={data.versions.lostPersonPurgeHours}
              canEdit={canEdit}
            />
            <ProductHistoryPanel enabled={enabled && canEdit} />
          </>
        )}
      </Card>
    </Section>
  );
}
