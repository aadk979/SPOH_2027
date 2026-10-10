import { useState } from 'react';
import { useEvent } from '@/shared/lib/eventContext';
import { downloadArchivePack } from '../api';
export function useArchivePackDownload() {
  const event = useEvent();
  const [failure, setFailure] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  async function download(id: string): Promise<void> {
    setDownloading(true); setFailure(null);
    try {
      const bytes = await downloadArchivePack(event.id, id);
      const url = URL.createObjectURL(bytes);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${event.slug}-archive-${id}.xlsx`; anchor.click();
      URL.revokeObjectURL(url);
    } catch { setFailure('The export could not be downloaded. Try again.'); }
    finally { setDownloading(false); }
  }
  return { failure, downloading, download };
}
