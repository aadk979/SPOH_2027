import type { ReactNode } from 'react';
import type { AttendanceController, AttendanceData } from '../hooks/useAttendanceScreen';
import { Button, Section } from '@/shared/ui';
import { VerifierCode } from '../VerifierCode';
export function VerifierPanel({
  data,
  controller,
}: {
  data: AttendanceData;
  controller: AttendanceController;
}): ReactNode {
  const { code, setCode, issue } = controller;
  return (
    <Section
      title="Verify attendance"
      description={
        data.isRoot
          ? 'Show your code to excos and volunteers present with you.'
          : 'Show your code to volunteers present with you. Excos must verify through the root admin.'
      }
    >
      {code ? (
        <>
          <VerifierCode
            key={code.token}
            challenge={code}
            pending={issue.isPending}
            refresh={() => issue.mutate()}
          />
          <Button variant="quiet" onClick={() => setCode(null)}>
            Hide QR and PIN
          </Button>
        </>
      ) : (
        <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
          {issue.isPending ? 'Generating…' : 'Show my QR and secondary PIN'}
        </Button>
      )}
    </Section>
  );
}
