import { WithdrawSwapRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button } from '@/shared/ui';
import { withdrawSwap } from '../api';
import { useStaffingWrite } from '../queries';
import { MutationFeedback } from './MutationFeedback';

export function WithdrawSwapButton({ id }: { id: string }) {
  const receipt = useRetryKey();
  const form = useZodForm(WithdrawSwapRequest, {});
  const mutation = useStaffingWrite(withdrawSwap);
  function withdraw() {
    const body = form.validate({ idempotencyKey: receipt.forInput(id) });
    if (body) mutation.mutate({ id, ...body }, { onSuccess: receipt.clear });
  }
  return (
    <>
      <Button variant="secondary" disabled={mutation.isPending} onClick={withdraw}>
        Withdraw request
      </Button>
      <MutationFeedback error={mutation.error} saved={mutation.isSuccess} />
    </>
  );
}
