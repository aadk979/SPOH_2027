import { describe, expect, it } from 'vitest';
import type { GoLiveCheckCode } from '@spoh/shared';
import { evaluateGoLiveReadiness } from '../../src/modules/event/domain/readiness/index.js';
import { CONTEXT, EVIDENCE, NOW, envelope } from './eventReadinessFixtures.js';

const evaluate = (code: GoLiveCheckCode, facts: unknown) =>
  evaluateGoLiveReadiness(CONTEXT, {
    ...EVIDENCE,
    [code]: envelope(facts),
  }).find((item) => item.code === code);

describe('operational readiness item rules', () => {
  it('requires at least one active category', () => {
    expect(evaluate('categories', { activeCategories: 0 })).toMatchObject({
      state: 'failed',
      reasons: ['categories-empty'],
    });
    expect(evaluate('categories', { activeCategories: -1 })?.state).toBe('unavailable');
    expect(evaluate('categories', { activeCategories: '1' })?.state).toBe('unavailable');
  });

  it.each([
    { batches: [] },
    { batches: [{ batchLabel: 'practice', rehearsal: true, unissuedCards: 10 }] },
    { batches: [{ batchLabel: null, rehearsal: false, unissuedCards: 10 }] },
    { batches: [{ batchLabel: '  ', rehearsal: false, unissuedCards: 10 }] },
    { batches: [{ batchLabel: 'live', rehearsal: false, unissuedCards: 0 }] },
  ])('requires a named live batch containing unissued cards', (facts) => {
    expect(evaluate('card-batch', facts)).toMatchObject({
      state: 'failed',
      reasons: ['live-card-batch-missing'],
    });
  });

  it('does not let a large practice batch conceal a missing live batch', () => {
    expect(
      evaluate('card-batch', {
        batches: [
          { batchLabel: 'practice', rehearsal: true, unissuedCards: 100 },
          { batchLabel: 'live', rehearsal: false, unissuedCards: 0 },
        ],
      })?.state,
    ).toBe('failed');
  });

  it('calculates every active gift type from live initial stock + adjustment - redemption', () => {
    const gift = EVIDENCE['gift-stock'].facts.gifts[0];
    expect(
      evaluate('gift-stock', { gifts: [{ ...gift, initialStock: 1, adjustment: 2, redeemed: 2 }] })
        ?.state,
    ).toBe('passed');
    expect(
      evaluate('gift-stock', { gifts: [{ ...gift, initialStock: 1, adjustment: 1, redeemed: 2 }] })
        ?.state,
    ).toBe('failed');
    expect(
      evaluate('gift-stock', { gifts: [{ ...gift, initialStock: 1, adjustment: -2, redeemed: 0 }] })
        ?.state,
    ).toBe('failed');
    expect(
      evaluate('gift-stock', { gifts: [gift, { ...gift, id: 'gift-b', redeemed: 50 }] })?.state,
    ).toBe('failed');
    expect(
      evaluate('gift-stock', {
        gifts: [
          gift,
          { ...gift, id: 'inactive', active: false, initialStock: 0, adjustment: 0, redeemed: 0 },
        ],
      })?.state,
    ).toBe('passed');
    expect(
      evaluate('gift-stock', { gifts: [{ ...gift, rehearsal: true, initialStock: 999 }] })?.state,
    ).toBe('unavailable');
  });

  it.each([
    { gifts: [] },
    { gifts: [{ ...EVIDENCE['gift-stock'].facts.gifts[0], active: false }] },
  ])('does not pass an empty active gift catalogue', (facts) => {
    expect(evaluate('gift-stock', facts)).toMatchObject({
      state: 'failed',
      reasons: ['gift-types-empty'],
    });
  });

  it('requires publication for every configured content key', () => {
    const facts = EVIDENCE.content.facts;
    expect(evaluate('content', { ...facts, documents: facts.documents.slice(1) })?.state).toBe(
      'failed',
    );
    expect(
      evaluate('content', {
        ...facts,
        documents: facts.documents.map((document) => ({ ...document, publishedVersion: null })),
      })?.state,
    ).toBe('failed');
    expect(
      evaluate('content', {
        ...facts,
        documents: facts.documents.map((document) => ({ ...document, publishedAtMs: null })),
      })?.state,
    ).toBe('failed');
    expect(evaluate('content', { ...facts, requiredKeys: [] })?.state).toBe('unavailable');
    expect(
      evaluate('content', {
        ...facts,
        documents: [{ ...facts.documents[0], publishedAtMs: NOW + 1 }],
      })?.state,
    ).toBe('unavailable');
  });

  it.each([
    { root: null, validatedTrustedNetworks: 1 },
    {
      root: { role: 'VOLUNTEER', status: 'ACTIVE' },
      validatedTrustedNetworks: 1,
    },
    { root: { role: 'ADMIN', status: 'INVITED' }, validatedTrustedNetworks: 1 },
    {
      root: { role: 'ADMIN', status: 'DEACTIVATED' },
      validatedTrustedNetworks: 1,
    },
    { root: { role: 'ADMIN', status: 'ENDED' }, validatedTrustedNetworks: 1 },
  ])('refuses a missing, inactive or non-admin attendance root', (facts) => {
    expect(evaluate('attendance', facts)).toMatchObject({
      state: 'failed',
      reasons: ['attendance-root-invalid'],
    });
  });

  it('refuses an invented Person active assertion on the attendance root', () => {
    expect(
      evaluate('attendance', {
        ...EVIDENCE.attendance.facts,
        root: { ...EVIDENCE.attendance.facts.root, personActive: true },
      })?.state,
    ).toBe('unavailable');
  });

  it('requires validated trusted networks even with an eligible root', () => {
    expect(
      evaluate('attendance', { ...EVIDENCE.attendance.facts, validatedTrustedNetworks: 0 }),
    ).toMatchObject({
      state: 'failed',
      reasons: ['attendance-networks-empty'],
    });
    expect(evaluate('attendance', { root: null, validatedTrustedNetworks: 0 })?.reasons).toEqual([
      'attendance-root-invalid',
      'attendance-networks-empty',
    ]);
  });

  it.each([
    { grantsVersion: 3, reviewedGrantsVersion: null, reviewedAtMs: null },
    { grantsVersion: 3, reviewedGrantsVersion: 2, reviewedAtMs: NOW - 1 },
    { grantsVersion: 3, reviewedGrantsVersion: 4, reviewedAtMs: NOW - 1 },
    { grantsVersion: 3, reviewedGrantsVersion: 3, reviewedAtMs: null },
  ])('requires review of the current grant version', (facts) => {
    expect(evaluate('role-permissions', facts)).toMatchObject({
      state: 'failed',
      reasons: ['role-permissions-unreviewed'],
    });
  });

  it('treats a future permissions review as unavailable', () => {
    expect(
      evaluate('role-permissions', { ...EVIDENCE['role-permissions'].facts, reviewedAtMs: NOW + 1 })
        ?.state,
    ).toBe('unavailable');
  });

  it.each([
    { transportConfigured: false, settingsValid: true },
    { transportConfigured: true, settingsValid: false },
    { transportConfigured: false, settingsValid: false },
  ])('requires configured notification transport and validated settings', (facts) => {
    expect(evaluate('notifications', facts)).toMatchObject({
      state: 'failed',
      reasons: ['notifications-unconfigured'],
    });
  });
});
