import { type ReactNode } from 'react';
import { type VolunteerAdminRecord } from '@spoh/shared';

import { useVolunteerEditor } from '../hooks/useVolunteerEditor';
import { VolunteerEditorFeedback } from './VolunteerEditorFeedback';
import { VolunteerEditorFields } from './VolunteerEditorFields';
import { VolunteerEditorActions } from './VolunteerEditorActions';
import { WithdrawVolunteerAccess } from './WithdrawVolunteerAccess';
import { PersonSessionActions } from './PersonSessionActions';
export function VolunteerEditor({ volunteer }: { volunteer: VolunteerAdminRecord }): ReactNode {
  const form = useVolunteerEditor(volunteer);
  return (
    <div className="flex flex-col gap-sm border-t border-line pt-sm">
      <VolunteerEditorFeedback volunteer={volunteer} form={form} />
      <VolunteerEditorFields volunteer={volunteer} form={form} />
      <VolunteerEditorActions volunteer={volunteer} form={form} />
      <WithdrawVolunteerAccess volunteer={volunteer} form={form} />
      <PersonSessionActions volunteer={volunteer} />
    </div>
  );
}
