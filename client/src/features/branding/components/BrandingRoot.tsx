'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { getClientEnv } from '@/shared/lib/env';
import { usePublicBranding } from '../queries';
import { brandingSlug } from '../model/brandingPath';
import { applyBrandingHead, clearBrandingHead } from '../model/head';

function HeadController() {
  const path = usePathname();
  const params = useSearchParams();
  const slug = brandingSlug(path, params.get('returnTo'));
  const query = usePublicBranding(slug);
  useEffect(() => {
    clearBrandingHead();
    if (query.data?.slug === slug && !query.isError) applyBrandingHead(query.data, getClientEnv().apiBaseUrl);
    return clearBrandingHead;
  }, [slug, query.data, query.isError]);
  return null;
}
export function BrandingRoot() { return <Suspense fallback={null}><HeadController /></Suspense>; }
