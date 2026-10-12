import { MutationFeedback as Feedback } from '@/shared/ui';

export function MutationFeedback({ error, saved }: { error: Error | null; saved: boolean }) {
  return <Feedback error={error} saved={saved} operation="Saving the roster" success="Saved. The roster has refreshed." />;
}
