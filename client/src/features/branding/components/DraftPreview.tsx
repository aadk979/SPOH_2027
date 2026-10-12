'use client';
import { useEffect, useState } from 'react';
import type { BrandingVariant } from '@spoh/shared';
import { ErrorState } from '@/shared/ui';
import { getDraftBrandingImage } from '../api';

function PreviewAsset({ eventId, variant }: { eventId: string; variant: BrandingVariant }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void getDraftBrandingImage(eventId, { variant, signal: controller.signal }).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [eventId, variant]);
  if (error) return <ErrorState error={error} operation="Load logo preview" />;
  return url ? <img src={url} alt={`${variant} publication preview`} width={variant === 'logo' ? 160 : 80} height={80} className="h-20 max-w-40 object-contain" /> : <p role="status">Loading {variant} preview…</p>;
}
export function DraftPreview({ eventId }: { eventId: string }) {
  return <div className="flex flex-wrap gap-md" aria-label="Normalized logo and icons">
    {(['logo', 'icon-192', 'icon-512', 'maskable-512'] as const).map((variant) => <figure key={variant} className="rounded-md border border-line bg-white p-sm text-black">
      <PreviewAsset eventId={eventId} variant={variant} /><figcaption className="text-caption">{variant}</figcaption>
    </figure>)}
  </div>;
}
