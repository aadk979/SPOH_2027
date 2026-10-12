import { EventSlug } from '@spoh/shared';

export function brandingSlug(path: string, returnTo?: string | null): string | null {
  const candidate = path.startsWith('/e/') ? path : path === '/sign-in' ? returnTo ?? '' : '';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return null;
  const segment = /^\/e\/([^/?#]+)(?:\/|$)/.exec(candidate)?.[1];
  const parsed = EventSlug.safeParse(segment);
  return parsed.success && parsed.data !== '_' ? parsed.data : null;
}
