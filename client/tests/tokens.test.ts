import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards on the token file.
 *
 * These exist because Tailwind v4 resolves a name collision between two theme
 * namespaces silently — no warning, no type error, just a wrong number in the
 * built CSS. It cost two rounds of screenshots to find the same bug twice, and
 * a unit test is three orders of magnitude cheaper than a screenshot.
 */

/**
 * Line endings normalised on read. The working tree is Windows, so the file is
 * CRLF on disk and every `\n`-anchored pattern below would quietly match
 * nothing — which is exactly the silent-pass a guard test must not have.
 */
const CSS = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles/globals.css'),
  'utf8',
).replace(/\r\n/g, '\n');

/** Every component and page, concatenated, so class usage can be checked. */
const CLIENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = globSync('src/**/*.tsx', { cwd: CLIENT_ROOT })
  // `globSync` returns paths relative to `cwd` and has no `absolute` option.
  .map((file) => readFileSync(path.join(CLIENT_ROOT, file), 'utf8'))
  .join('\n');

function tokenNames(namespace: string): string[] {
  return [...CSS.matchAll(new RegExp(`^\\s+--${namespace}-([a-z0-9-]+):`, 'gm'))].map(
    (match) => match[1] as string,
  );
}

describe('design tokens', () => {
  /**
   * `max-w-<name>` reads the spacing scale BEFORE the container scale, so a
   * name defined in both resolves to the spacing value.
   *
   * This shipped twice. First as `max-w-sm`, which took the 12px
   * `--spacing-sm` and collapsed the IC station picker to a 12px stub. Then —
   * after the widths had been moved to their own namespace to prevent exactly
   * that — as `max-w-field`, when `--spacing-field` was added for input heights
   * and quietly turned the same select into a 48px one.
   */
  it('never defines the same name under --spacing-* and --container-*', () => {
    const spacing = new Set(tokenNames('spacing'));
    const collisions = tokenNames('container').filter((name) => spacing.has(name));

    expect(
      collisions,
      `--container-${collisions.join(', --container-')} is shadowed by a --spacing-* token of the ` +
        `same name, so max-w-${collisions.join('/max-w-')} silently resolves to the spacing value. ` +
        `Rename one side.`,
    ).toEqual([]);
  });

  /**
   * The other half of the same trap. Tailwind ships its own container scale,
   * and a `--container-*` reusing one of those names is dropped rather than
   * merged — `--container-prose: 40rem` never reached the stylesheet at all and
   * `max-w-prose` silently kept the built-in `65ch`, which is measured in `ch`
   * and therefore moved with the font size at each density.
   */
  it('never reuses a name from Tailwind own container scale', () => {
    const RESERVED = new Set([
      'prose',
      '3xs',
      '2xs',
      'xs',
      'sm',
      'md',
      'lg',
      'xl',
      '2xl',
      '3xl',
      '4xl',
      '5xl',
      '6xl',
      '7xl',
    ]);
    const clashes = tokenNames('container').filter((name) => RESERVED.has(name));

    expect(
      clashes,
      `--container-${clashes.join(', --container-')} collides with Tailwind's built-in container ` +
        `scale and will be ignored. Pick a name of your own.`,
    ).toEqual([]);
  });

  /**
   * And the check that would have caught all three at once: every width the app
   * asks for must be a width this file actually defines. A `max-w-<name>` with
   * no matching token is either a typo or a silent fall-through to somebody
   * else's value.
   */
  it('only uses max-w utilities backed by a --container-* token', () => {
    const declared = new Set(tokenNames('container'));
    const used = new Set(
      [...SOURCES.matchAll(/\bmax-w-([a-z][a-z0-9-]*)\b/g)].map((match) => match[1] as string),
    );
    const unbacked = [...used].filter((name) => !declared.has(name));

    expect(
      unbacked,
      `max-w-${unbacked.join(', max-w-')} has no --container-* token in globals.css, so it ` +
        `resolves against the spacing scale or a Tailwind built-in instead.`,
    ).toEqual([]);
  });

  /**
   * Setting `font-size` on `html` re-bases every `rem` in the file, and the
   * `body` rule then compounds against it — 1.0625rem on both rendered 18.06px,
   * not 17px, and inflated the whole app by 6%.
   */
  it('sets the base font size on body only, never on html', () => {
    const htmlBlock = /(^|\n)\s*html\s*(,\s*body\s*)?\{[^}]*\}/g;

    for (const [block] of [...CSS.matchAll(htmlBlock)].map((m) => [m[0]])) {
      expect(block, `an html rule sets font-size, which re-bases rem:\n${block}`).not.toMatch(
        /font-size/,
      );
    }
  });

  /**
   * The capture screens are exempt from the `pointer: fine` density step: a
   * booth tablet is driven by a thumb whatever the browser reports, and the
   * 88px floor is a BUILD_PLAN §9.4 promise the e2e suite also measures.
   */
  it('keeps the capture targets out of the mouse-density block', () => {
    const fineBlock = CSS.slice(CSS.indexOf('@media (pointer: fine)'));
    const body = fineBlock.slice(0, fineBlock.indexOf('\n}\n'));

    expect(body).not.toMatch(/capture-target|capture-primary/);
    expect(CSS).toMatch(/\.capture-target\s*\{[^}]*min-height:\s*88px/);
  });
});
