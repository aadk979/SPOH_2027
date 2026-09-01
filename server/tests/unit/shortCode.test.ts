import { describe, expect, it } from 'vitest';
import {
  SHORT_CODE_SPACE,
  generateQrPayload,
  generateShortCode,
  normaliseShortCode,
} from '../../src/lib/shortCode.js';

/**
 * Mission Card identifiers (PRODUCT_BRIEF §4.4).
 *
 * The short code is the fallback for a damaged QR, which means a volunteer has
 * to read it off a scuffed card under hall lighting and type it correctly on
 * the first try. That constraint is what these tests are protecting.
 */

describe('generateShortCode', () => {
  it('is six characters', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateShortCode()).toHaveLength(6);
    }
  });

  it('never emits a character a volunteer would misread', () => {
    // I/1, O/0 and L/1 are the confusable pairs. U is dropped so the codes are
    // less likely to spell something.
    const forbidden = /[ILOU]/;

    for (let i = 0; i < 500; i += 1) {
      expect(generateShortCode()).not.toMatch(forbidden);
    }
  });

  it('uses only the documented alphabet', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateShortCode()).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{6}$/);
    }
  });

  it('does not collide meaningfully at print-batch scale', () => {
    // A realistic batch. Collisions here would mean two cards with one journey.
    const codes = new Set(Array.from({ length: 5000 }, () => generateShortCode()));
    expect(codes.size).toBeGreaterThan(4990);
  });

  it('has a keyspace large enough that a batch is safe', () => {
    // 32^6. At a few thousand cards the birthday probability is negligible.
    expect(SHORT_CODE_SPACE).toBe(32 ** 6);
  });
});

describe('generateQrPayload', () => {
  it('is opaque and namespaced, never a URL', () => {
    const payload = generateQrPayload();

    // A scannable link would invite a visitor to scan their own card and reach
    // a system with no visitor-facing surface at all.
    expect(payload).toMatch(/^spoh2027:[0-9a-f-]{36}$/);
    expect(payload).not.toMatch(/https?:/);
  });

  it('is unique across a batch', () => {
    const payloads = new Set(Array.from({ length: 1000 }, () => generateQrPayload()));
    expect(payloads.size).toBe(1000);
  });
});

describe('normaliseShortCode', () => {
  it('accepts what a volunteer would actually type', () => {
    expect(normaliseShortCode(' aaa111 ')).toBe('AAA111');
    expect(normaliseShortCode('AAA-111')).toBe('AAA111');
    expect(normaliseShortCode('aaa 111')).toBe('AAA111');
  });
});
