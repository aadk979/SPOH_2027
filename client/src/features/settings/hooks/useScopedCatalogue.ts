import { useCallback, useEffect, useState } from 'react';
import type { ScopedSettingsTarget } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { useScopedSettingsCache, useScopedSettingsCurrent } from '../queries';

export function useScopedCatalogue(target: ScopedSettingsTarget) {
  const [denied, setDenied] = useState(false);
  const { clear } = useScopedSettingsCache();
  const current = useScopedSettingsCurrent(target, !denied);
  const deny = useCallback(() => {
    setDenied(true);
    clear();
  }, [clear]);
  const readDenied = current.error instanceof ApiError && [401, 403].includes(current.error.status);
  useEffect(() => {
    if (readDenied) deny();
  }, [readDenied, deny]);
  return { current, denied, deny };
}
