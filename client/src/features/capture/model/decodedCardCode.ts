/** Preserve the current QR fallback until the separately labelled correctness work. */
export function decodedCardCode(text: string): string | undefined {
  const cleaned = text.trim();
  return /^[0-9A-HJ-NP-Z]{6}$/i.test(cleaned)
    ? cleaned.toUpperCase()
    : cleaned.split(':').pop()?.slice(0, 6).toUpperCase();
}
