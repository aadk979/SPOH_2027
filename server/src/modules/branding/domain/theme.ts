import { BrandingAccent } from '@spoh/shared';

const components = (hex: string) => hex.slice(1).match(/../g)!.map((part) => parseInt(part, 16));
const luminance = (hex: string) => components(hex).reduce((sum, byte, index) => {
  const c = byte / 255;
  return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!;
}, 0);
export function colourContrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
function adjust(hex: string, background: string, toward: number): string {
  let bytes = components(hex);
  let colour = hex;
  while (colourContrast(colour, background) < 7) {
    bytes = bytes.map((byte) => Math.round(byte * 0.9 + toward * 0.1));
    colour = `#${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  return colour;
}
/** Fixed declarations only. Safety and capture colours keep their own tokens. */
export function brandingCss(accent: string): string {
  const value = BrandingAccent.parse(accent);
  const light = adjust(value, '#ffffff', 0);
  const dark = adjust(value, '#272729', 255);
  const darkTokens = `--color-primary:${dark};--color-primary-focus:${dark};--color-primary-on-dark:${dark};--color-on-primary:#000000;`;
  return `:root{--color-primary:${light};--color-primary-focus:${light};--color-primary-on-dark:${dark};--color-on-primary:#ffffff;}\n:root[data-theme="dark"],[data-theme="dark"]{${darkTokens}}\n@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${darkTokens}}}\n`;
}
