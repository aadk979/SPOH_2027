'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Stack } from '@/shared/ui';
import { useMe, useRequireSession } from '@/features/session';
import { LifecyclePanel } from '@/features/events';
import { ScheduleTimelinePanel } from '@/features/schedule';
import { CategorySchedulesPanel } from '@/features/taxonomy';
import { SettingsFeedback } from '../components/SettingsFeedback';
import { EventNameField } from '../components/EventNameField';
import { ProductRulesForm } from '../components/ProductRulesForm';
import { ShiftHoursForm } from '../components/ShiftHoursForm';
import { AttendanceSettingsForm } from '../components/AttendanceSettingsForm';
import { CaptureControlsPanel } from '../components/CaptureControlsPanel';
import { OperationalCataloguePanel } from '../components/OperationalCataloguePanel';
import { OrganisationSettingsForm } from '../components/OrganisationSettingsForm';
export default function AdminSettingsScreen(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  if (!session) return null;
  const canEdit = me?.capabilities.includes('config.manage') ?? false;
  return (
    <AppShell title="Event settings" back={{ href: '/chief', label: 'Ops' }} width="reading">
      <Stack>
        <SettingsFeedback canEdit={canEdit} />
        <EventNameField canEdit={canEdit} />
        <LifecyclePanel enabled={canEdit} />
        <ScheduleTimelinePanel enabled={canEdit} />
        <CategorySchedulesPanel enabled={canEdit} />
        <CaptureControlsPanel enabled={canEdit} />
        <OperationalCataloguePanel enabled={canEdit} />
        <ShiftHoursForm enabled={session !== null} canEdit={canEdit} />
        <ProductRulesForm enabled={session !== null} canEdit={canEdit} />
        <AttendanceSettingsForm enabled={canEdit} />
        <OrganisationSettingsForm enabled={canEdit} />
      </Stack>
    </AppShell>
  );
}
