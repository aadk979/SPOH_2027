'use client';
import { Suspense, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getClientEnv } from '@/shared/lib/env';
import { useOptionalEvent } from '@/shared/lib/eventContext';
import { usePublicBranding } from '../queries';
import { brandingSlug } from '../model/brandingPath';
import { publicBrandingUrl } from '../api';
import type { PublicBranding } from '@spoh/shared';

function IdentityImage({ src, alt, compact }: { src: string; alt: string; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // Approved public logos are normalized raster assets; no Next image optimizer is available in a static export.
  return <img src={src} alt={alt} width={compact ? 32 : 120} height={compact ? 32 : 40} crossOrigin="anonymous" className={compact ? 'h-8 w-8 object-contain rounded-sm bg-white' : 'h-10 w-30 object-contain rounded-sm bg-white'} onError={() => setFailed(true)} />;
}
function SelectedIdentity({ brand, name, compact }: { brand: PublicBranding | null; name: string; compact: boolean }) {
  const logo = brand?.logo;
  const src = logo ? publicBrandingUrl(logo.path, { slug: brand!.slug, apiBaseUrl: getClientEnv().apiBaseUrl }) : null;
  return <span className={compact ? 'inline-flex min-w-0 items-center gap-sm' : 'inline-flex items-center gap-sm'}>
    {src && logo ? <IdentityImage key={src} src={src} alt={logo.alt} compact={compact} /> : null}
    <span className={compact ? 'truncate' : undefined}>{name}</span>
  </span>;
}
function selectedSlug(input: { slug?: string; eventSlug?: string; path: string }) { return input.slug ?? input.eventSlug ?? brandingSlug(input.path); }
function selectedName(input: { name?: string; eventName?: string; brand: PublicBranding | null }) { return input.name ?? input.eventName ?? input.brand?.name ?? 'Volunteer operations'; }
export function EventIdentity({ name, slug, compact = false }: { name?: string; slug?: string; compact?: boolean }) {
  const event = useOptionalEvent();
  const path = usePathname();
  const selected = selectedSlug({ slug, eventSlug: event?.slug, path });
  const query = usePublicBranding(selected);
  const brand = !query.isError && query.data?.slug === selected ? query.data : null;
  return <SelectedIdentity brand={brand} name={selectedName({ name, eventName: event?.name, brand })} compact={compact} />;
}
function SignInBrand() {
  const params = useSearchParams();
  const slug = brandingSlug('/sign-in', params.get('returnTo'));
  return <EventIdentity slug={slug ?? undefined} />;
}
export function SignInIdentity() { return <Suspense fallback={<span>Volunteer operations</span>}><SignInBrand /></Suspense>; }
