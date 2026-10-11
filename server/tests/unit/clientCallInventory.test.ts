import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clientCallInventory } from '../helpers/clientCallInventory.js';

const root = fileURLToPath(new URL('../fixtures/client-call-inventory/', import.meta.url));
const calls = clientCallInventory(root);
const methodsFor = (path: string) =>
  [...new Set(calls.filter((call) => call.path === path).map((call) => call.method))].sort();

describe('source-derived request methods', () => {
  it('keeps the default GET when optional signal options have no method', () => {
    expect(methodsFor('/optional-signal')).toEqual(['GET']);
  });

  it('resolves each conditional branch, including options bound to a variable', () => {
    expect(methodsFor('/mixed-methods')).toEqual(['GET', 'POST']);
    expect(methodsFor('/bound-options')).toEqual(['DELETE', 'GET']);
  });

  it('never substitutes GET for an explicit unresolved method or options object', () => {
    expect(methodsFor('/unknown-method')).toEqual([]);
    expect(methodsFor('/unknown-options')).toEqual([]);
    expect(methodsFor('/known-or-unknown')).toEqual(['GET']);
  });

  it('honours object spread order without inventing a method for unresolved spreads', () => {
    expect(methodsFor('/unknown-spread')).toEqual([]);
    expect(methodsFor('/explicit-after-spread')).toEqual(['POST']);
    expect(methodsFor('/unknown-after-method')).toEqual([]);
    expect(methodsFor('/known-spread')).toEqual(['PATCH']);
    expect(methodsFor('/known-read-spread')).toEqual(['GET']);
  });
});
