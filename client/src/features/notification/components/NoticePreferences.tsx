'use client';
import { useState, type ReactNode } from 'react';
import type { NoticePreferenceRecord } from '@spoh/shared';
import { Button, Card, Checkbox, ErrorState, LoadingRows, MutationFeedback } from '@/shared/ui';
import { useNoticePreference, useSaveNoticePreference } from '../centreQueries';
import { AlertDelivery } from './AlertDelivery';

export function NoticePreferences(): ReactNode {
  const query = useNoticePreference();
  if (query.isError) return <ErrorState error={query.error} operation="Push preferences" onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingRows label="Loading push preferences" />;
  return <PreferenceForm key={query.data.updatedAt ?? 'defaults'} preference={query.data} />;
}
function PreferenceForm({ preference }: { preference: NoticePreferenceRecord }): ReactNode {
  const [urgentPush, setUrgentPush] = useState(preference.urgentPush);
  const [operationalPush, setOperationalPush] = useState(preference.operationalPush);
  const save = useSaveNoticePreference();
  return <section aria-labelledby="push-preferences" className="flex flex-col gap-sm">
    <h2 id="push-preferences" className="text-tagline font-semibold">Push preferences</h2>
    <Card className="flex flex-col gap-sm">
      <p>These settings apply to your devices. Notices remain in your notification centre when push is off.</p>
      <Checkbox label="Urgent push alerts" checked={urgentPush} disabled={save.isPending}
        onChange={(event) => { save.reset(); setUrgentPush(event.target.checked); }} />
      <Checkbox label="Operational push alerts" checked={operationalPush} disabled={save.isPending}
        onChange={(event) => { save.reset(); setOperationalPush(event.target.checked); }} />
      <p className="text-caption text-text-muted">Informational notices appear in the centre. They do not send a device alert.</p>
      <Button disabled={save.isPending} onClick={() => save.mutate({ urgentPush, operationalPush })}>Save push preferences</Button>
      <MutationFeedback pending={save.isPending} saved={save.isSuccess} error={save.error}
        operation="Saving push preferences" success="Push preferences saved." />
    </Card>
    <AlertDelivery />
  </section>;
}
