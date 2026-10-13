import { describe, expect, it } from 'vitest';
import { collectExecutableScriptTexts, type StaticHtmlNode } from './scripts.js';

const HTML = 'http://www.w3.org/1999/xhtml';
const script = (attrs?: { name: string; value: string }[], childNodes?: StaticHtmlNode[]): StaticHtmlNode => ({
  nodeName: 'script', tagName: 'script', namespaceURI: HTML, attrs,
  childNodes: childNodes ?? [{ nodeName: '#text', value: '  private &amp; π\n' }],
});
const document = (...childNodes: StaticHtmlNode[]): StaticHtmlNode => ({ nodeName: '#document', childNodes });

describe('the pure static HTML executable-script boundary', () => {
  it('retains exact text, Unicode, entities and whitespace through nested nodes', () => {
    const ast = document({ nodeName: 'body', tagName: 'body', childNodes: [script(), script([], [
      { nodeName: '#text', value: 'first\n' }, { nodeName: '#text' }, { nodeName: '#text', value: 'second' },
    ])] });
    expect(collectExecutableScriptTexts(ast)).toEqual(['  private &amp; π\n', 'first\nsecond']);
  });
  it.each(['', 'module', 'MODULE', 'importmap', 'speculationrules', ' Text/JavaScript ; charset=utf-8 ',
    'application/ecmascript', 'text/x-javascript'])('includes an inline executable %s script', (value) => {
    expect(collectExecutableScriptTexts(document(script([{ name: 'type', value }])))).toEqual(['  private &amp; π\n']);
  });
  it.each(['application/json', 'text/plain', ' module ', 'unknown-language'])(
    'does not hash inert type %s as an executable script', (value) => {
      expect(collectExecutableScriptTexts(document(script([{ name: 'type', value }])))).toEqual([]);
    });
  it.each(['', ' JavaScript1.4 ', 'javascript', 'JSCRIPT'])(
    'supports the HTML legacy executable language %s only when type is absent', (value) => {
      expect(collectExecutableScriptTexts(document(script([{ name: 'language', value }])))).toHaveLength(1);
      expect(collectExecutableScriptTexts(document(script([{ name: 'language', value },
        { name: 'type', value: 'application/json' }])))).toEqual([]);
    });
  it('excludes unknown languages and external src scripts even with an empty src', () => {
    expect(collectExecutableScriptTexts(document(script([{ name: 'language', value: 'untrusted' }]),
      script([{ name: 'src', value: '' }]), script([{ name: 'src', value: '/bundle.js' }])))).toEqual([]);
  });
  it('handles empty executable elements and document nodes without children', () => {
    expect(collectExecutableScriptTexts(document({ nodeName: 'script', tagName: 'script', namespaceURI: HTML }))).toEqual(['']);
    expect(collectExecutableScriptTexts({ nodeName: '#document' })).toEqual([]);
  });
  it.each(['template', 'noscript'])('never visits inert %s contents', (tagName) => {
    const foreign = { ...script(), namespaceURI: 'http://www.w3.org/2000/svg' };
    expect(collectExecutableScriptTexts(document({ nodeName: tagName, tagName,
      childNodes: [foreign, { nodeName: 'style', tagName: 'style' }] }))).toEqual([]);
  });
  it('refuses active foreign-namespace scripts instead of guessing their browser semantics', () => {
    expect(() => collectExecutableScriptTexts(document({ ...script(), namespaceURI: 'http://www.w3.org/2000/svg' })))
      .toThrow('Foreign-namespace');
  });
  it.each([{ nodeName: 'style', tagName: 'style' }, { nodeName: 'div', tagName: 'div', attrs: [{ name: 'style', value: 'color:red' }] },
    { nodeName: 'img', tagName: 'img', attrs: [{ name: 'onerror', value: 'alert(1)' }] }])(
    'refuses active inline markup before producing an incomplete policy', (node) => {
      expect(() => collectExecutableScriptTexts(document(node))).toThrow('linked styles');
    });
});
