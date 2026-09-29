import { describe, expect, it } from 'vitest';
import { isLoopback } from '../../src/modules/health/http/routes.js';

describe('readiness is for the container only (F04-008)', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('answers %s', (address) => {
    expect(isLoopback(address)).toBe(true);
  });

  it.each(['10.0.1.23', '::ffff:10.0.1.23', '203.0.113.5', undefined])('refuses %s', (address) => {
    expect(isLoopback(address)).toBe(false);
  });
});
