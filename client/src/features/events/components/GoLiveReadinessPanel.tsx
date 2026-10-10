import { useAllows } from '@/features/session';
import { Callout, LoadingRows, Section } from '@/shared/ui';
import { useLifecycleReadiness } from '../queries';
import { GoLiveChecklist } from './GoLiveChecklist';

export function GoLiveReadinessPanel() {
  const allows = useAllows();
  const enabled = allows('Settings.Read');
  const readiness = useLifecycleReadiness(enabled);
  if (!enabled) return null;
  if (readiness.isError)
    return (
      <Callout tone="alert">
        Readiness could not be loaded. Reload before changing event state.
      </Callout>
    );
  if (!readiness.data)
    return (
      <Section title="Go-live readiness">
        <LoadingRows />
      </Section>
    );
  return <GoLiveChecklist items={readiness.data.goLiveReadiness} />;
}
