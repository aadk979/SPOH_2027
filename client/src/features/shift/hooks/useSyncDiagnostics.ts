import { useState } from 'react';
import { useOutboxEntries } from '@/shared/shell/SyncIndicator';
import { toClipboardText } from '@/shared/lib/outbox';
export function useSyncDiagnostics() {
  const entries = useOutboxEntries();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const failed = entries.filter((entry) => entry.status === 'failed');
  const pending = entries.filter((entry) => entry.status !== 'failed');

  async function copyFailed(): Promise<void> {
    try {
      await navigator.clipboard.writeText(toClipboardText(failed));
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard access can be refused (iOS Safari, an unfocused tab). This
      // is the moment an IC is salvaging failed captures during an outage —
      // it must say so rather than quietly do nothing.
      setCopied(false);
      setCopyError(true);
    }
  }

  return { entries, failed, pending, copied, copyError, copyFailed };
}
export type SyncDiagnosticsState = ReturnType<typeof useSyncDiagnostics>;
