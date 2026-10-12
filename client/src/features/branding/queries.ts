'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BrandingDraft } from '@spoh/shared';
import { useAllows, useCurrentSession } from '@/features/session';
import { useEvent } from '@/shared/lib/eventContext';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { getBranding, getPublicBranding, publishBranding, saveBranding, uploadBranding } from './api';

export const publicBrandingKeys = { slug: (slug: string | null) => ['public-branding', slug] as const };
export function usePublicBranding(slug: string | null) {
  return useQuery({ queryKey: publicBrandingKeys.slug(slug), queryFn: ({ signal }) => getPublicBranding(slug!, signal), enabled: !!slug, retry: false, staleTime: 0, refetchInterval: 30_000 });
}
export function useBrandingState() {
  const event = useEvent();
  const session = useCurrentSession();
  const enabled = useAllows()('Settings.Read') && !!session;
  return useQuery({ queryKey: [event.id, 'branding', session?.volunteerId], queryFn: ({ signal }) => getBranding(event.id, signal), enabled, retry: false, staleTime: 0, gcTime: 0 });
}
export function useBrandingWrites(version: number) {
  const event = useEvent();
  const client = useQueryClient();
  const saveKey = useRetryKey();
  const publishKey = useRetryKey();
  const uploadKey = useRetryKey();
  const onSuccess = async () => {
    await client.invalidateQueries({ queryKey: [event.id, 'branding'] });
    await client.invalidateQueries({ queryKey: publicBrandingKeys.slug(event.slug) });
  };
  const save = useMutation({ mutationFn: (body: BrandingDraft) => saveBranding(event.id, { expectedVersion: version, body, idempotencyKey: saveKey.forInput({ version, body }) }), onSuccess: async () => { saveKey.clear(); await onSuccess(); } });
  const publish = useMutation({ mutationFn: () => publishBranding(event.id, { expectedVersion: version, idempotencyKey: publishKey.forInput({ version }) }), onSuccess: async () => { publishKey.clear(); await onSuccess(); } });
  const upload = useMutation({ mutationFn: (file: File) => uploadBranding(event.id, { file, body: { expectedVersion: version, contentType: file.type as 'image/png' | 'image/jpeg' | 'image/webp', contentLength: file.size, idempotencyKey: uploadKey.forInput({ version, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified }) } }), onSuccess: () => uploadKey.clear() });
  return { save, publish, upload };
}
