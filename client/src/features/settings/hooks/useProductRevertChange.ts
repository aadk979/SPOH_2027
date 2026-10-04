import { useRef, useState } from 'react';
import type { RevertEventSettingRequest } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { createRetryIntent } from '@/shared/lib/retryIntent';
import { useRevertProductSetting } from '../queries';
import { productRevertError } from '../model/productHistory';

const EMPTY = { error: null as string | null, denied: false, blocked: false, uncertain: false };
export function useProductRevertChange() {
  const [state, setState] = useState(EMPTY);
  const intent = useRef(createRetryIntent());
  const mutation = useRevertProductSetting();
  function reset() {
    setState(EMPTY);
    mutation.reset();
    intent.current.clear();
  }
  function fail(error: string) {
    setState((current) => ({ ...current, error }));
  }
  function apply(request: RevertEventSettingRequest) {
    mutation.mutate(request, {
      onSuccess: () => setState(EMPTY),
      onError: (failure) => {
        const api = failure instanceof ApiError ? failure : null;
        setState({
          error: productRevertError(failure),
          denied: !!api && (api.status === 401 || api.status === 403),
          blocked:
            !!api &&
            [400, 404, 409, 422].includes(api.status) &&
            api.code !== 'IDEMPOTENCY_IN_PROGRESS',
          uncertain: !api || api.status >= 500 || api.code === 'IDEMPOTENCY_IN_PROGRESS',
        });
      },
    });
  }
  return {
    ...state,
    mutation,
    reset,
    fail,
    apply,
    keyFor: (body: unknown) => intent.current.keyFor(body),
  };
}
