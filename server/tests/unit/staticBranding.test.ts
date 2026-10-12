import { describe, expect, it } from 'vitest';
import type { PublicBranding } from '@spoh/shared';
import { brandedHtml, brandingSlugFromAddress, htmlEtag } from '../../src/platform/http/staticBranding.js';

const brand: PublicBranding = { slug: 'open-day', name: 'Open <Day> & "Team"', accent: '#0066cc',
  publicationId: 'publication', publicationVersion: 1, logo: null, icons: [],
  themePath: '/api/v1/public/events/open-day/branding/theme.css',
  manifestPath: '/api/v1/public/events/open-day/branding/manifest.webmanifest' };
describe('static event metadata', () => {
  it('changes head metadata while retaining exact inline and external script bytes', () => {
    const inline = '<script>\r\nself.__next.push("<title>script title</title><meta name="theme-color" content="keep">");\r\n</script>';
    const external = '<script src="/_next/static/a.js" async></script>';
    const html = `<html><head><title>Old</title><meta name="theme-color" content="#000000"><link rel="manifest" href="/old">${inline}${external}</head><body><title>Body unchanged</title></body></html>`;
    const actual = brandedHtml(html, brand, 'https://api.example.test');
    expect(actual).toContain(inline);
    expect(actual).toContain(external);
    expect(actual).toContain('<body><title>Body unchanged</title></body>');
    expect(actual).not.toContain('<title>Old</title>');
    expect(actual).toContain('Open &lt;Day&gt; &amp; &quot;Team&quot;');
    expect(actual).toContain('https://api.example.test/api/v1/public/events/open-day/branding/theme.css');
    expect(brandedHtml('no head', brand, '')).toBe('no head');
  });
  it('does not treat a head delimiter inside script, style or comment text as the closing head', () => {
    const script = '<script>self.__next.push("</head><title>Script identity</title>");</script>';
    const style = '<style>.identity:after { content: "</head><title>CSS identity</title>"; }</style>';
    const comment = '<!-- </head><title>Comment identity</title> -->';
    const html = '<html><HEAD><title>Old</title>' + comment + script + style + '</HEAD><body>Same body</body></html>';
    const result = brandedHtml(html, brand, '');
    expect(result).toContain(script);
    expect(result).toContain(style);
    expect(result).toContain(comment);
    expect(result).toContain('</HEAD><body>Same body</body>');
    expect(result).not.toContain('<title>Old</title>');
    expect(result.indexOf('<title data-event-branding')).toBeGreaterThan(result.indexOf('</style>'));
  });
  it('partitions sign-in metadata by a safe local event return path', () => {
    expect(brandingSlugFromAddress('/e/open-day/home')).toBe('open-day');
    expect(brandingSlugFromAddress('/sign-in?returnTo=%2Fe%2Fopen-day%2Fhome')).toBe('open-day');
    for (const path of ['/sign-in?returnTo=https://outside.test/e/open-day/home',
      '/sign-in?returnTo=//outside.test/e/open-day/home', '/sign-in?returnTo=/e/open-day\\evil',
      '/sign-in', '/events']) expect(brandingSlugFromAddress(path)).toBeNull();
    expect(htmlEtag(brandedHtml('<head></head>', brand, ''))).not.toBe(htmlEtag(brandedHtml('<head></head>', { ...brand, name: 'Changed' }, '')));
  });
  it('refuses an arbitrary published asset address even if called outside DTO validation', () => {
    expect(() => brandedHtml('<head></head>', { ...brand, themePath: 'https://outside.test/theme.css' }, '')).toThrow('asset');
  });
});
