'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { LoadingCards, Stack } from '@/shared/ui';
import { useMe, useRequireSession } from '@/features/session';
import { LifecyclePanel } from '@/features/events';
import { ScheduleTimelinePanel } from '@/features/schedule';
import { useSettingsForm } from '../hooks/useSettingsForm';
import { SettingsFeedback } from '../components/SettingsFeedback';
import { EventNameField } from '../components/EventNameField';
import { ProductRulesForm } from '../components/ProductRulesForm';
import { ShiftHoursForm } from '../components/ShiftHoursForm';
import { ThresholdsForm } from '../components/ThresholdsForm';
import { SettingsApply } from '../components/SettingsApply';
import { AttendanceSettingsForm } from '../components/AttendanceSettingsForm';
import { CaptureControlsPanel } from '../components/CaptureControlsPanel';
import { OperationalCataloguePanel } from '../components/OperationalCataloguePanel';
export default function AdminSettingsScreen(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const form = useSettingsForm(session !== null);
  if (!session) return null;
  const canEdit = me?.capabilities.includes('config.manage') ?? false;
  return (
    <AppShell title="Event settings" back={{ href: '/chief', label: 'Ops' }} width="reading">
      <Stack>
        <SettingsFeedback form={form} canEdit={canEdit} />
        {form.settings.isPending ? (
          <LoadingCards />
        ) : (
          <>
            <EventNameField form={form} canEdit={canEdit} />
            <LifecyclePanel enabled={canEdit} />
            <ScheduleTimelinePanel enabled={canEdit} />
            <CaptureControlsPanel enabled={canEdit} />
            <OperationalCataloguePanel enabled={canEdit} />
            <ShiftHoursForm enabled={session !== null} canEdit={canEdit} />
            <ProductRulesForm enabled={session !== null} canEdit={canEdit} />
            <AttendanceSettingsForm enabled={canEdit} />
            <ThresholdsForm form={form} canEdit={canEdit} />
            <SettingsApply form={form} canEdit={canEdit} />
          </>
        )}
      </Stack>
    </AppShell>
  );
}
