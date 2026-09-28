import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
export function DeviceRegistrations({ board }: { board: StationDashboardResponse }): ReactNode {
  return (
    <Section
      title="Registrations per device"
      description="Two volunteers on one queue should track each other. A gap that appears here can still be explained; a gap found at reconciliation cannot."
    >
      <BarList>
        {board.registrations.byDevice.map((device) => {
          const max = Math.max(1, ...board.registrations.byDevice.map((row) => row.value));

          return (
            <div key={device.volunteerId}>
              <BarRow label={device.volunteerName} value={device.value} max={max} />
              {device.rateAnomaly ? (
                /*
                              Sits directly under its own bar rather than at a
                              hard-coded 160px indent, which on a phone put the
                              warning under the wrong volunteer entirely.
                            */
                <p className="mt-xxs text-caption text-warn">
                  <span aria-hidden="true">▲ </span>
                  {device.perMinute}/min — check they are not tapping to catch up
                </p>
              ) : null}
            </div>
          );
        })}
      </BarList>
    </Section>
  );
}
