import { CreateSwapRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { requestSwap } from '../api';
import { useStaffingWrite } from '../queries';

export function useSwapRequestForm() {
  const form = useZodForm(CreateSwapRequest, {
    assignmentId: '',
    targetVolunteerId: '',
    reason: '',
  });
  const mutation = useStaffingWrite(requestSwap);
  const receipt = useRetryKey();
  function submit() {
    const input = {
      assignmentId: form.values.assignmentId,
      targetVolunteerId: form.values.targetVolunteerId,
      ...(form.values.reason.trim() ? { reason: form.values.reason } : {}),
    };
    const body = form.validate({ ...input, idempotencyKey: receipt.forInput(input) });
    if (body)
      mutation.mutate(body, {
        onSuccess: () => {
          receipt.clear();
          form.reset();
        },
      });
  }
  return { form, mutation, submit };
}
