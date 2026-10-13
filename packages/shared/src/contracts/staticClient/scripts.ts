/** Structural subset of parse5's default AST. Pure traversal, with no parser or Node dependency. */
export interface StaticHtmlNode {
  nodeName: string;
  tagName?: string;
  namespaceURI?: string;
  attrs?: readonly { name: string; value: string }[];
  childNodes?: readonly StaticHtmlNode[];
  value?: string;
}
const HTML = 'http://www.w3.org/1999/xhtml';
const JS_MIMES = new Set(['application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1',
  'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5',
  'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript']);
function executable(node: StaticHtmlNode): boolean {
  const attributes = node.attrs ?? [];
  if (attributes.some((attribute) => attribute.name === 'src')) return false;
  const type = attributes.find((attribute) => attribute.name === 'type');
  if (!type) {
    const language = attributes.find((attribute) => attribute.name === 'language')?.value;
    return !language || JS_MIMES.has(`text/${language.toLowerCase().trim()}`);
  }
  if (type.value === '') return true;
  const raw = type.value.toLowerCase();
  if (['module', 'importmap', 'speculationrules'].includes(raw)) return true;
  return JS_MIMES.has(raw.trim().split(';', 1)[0]!.trim());
}
function forbiddenInlineMarkup(node: StaticHtmlNode): boolean {
  return node.tagName === 'style' || Boolean(node.attrs?.some((attribute) => attribute.name === 'style' || /^on/i.test(attribute.name)));
}
function inspectNode(node: StaticHtmlNode, texts: string[]): void {
  if (node.tagName === 'script') {
    if (node.namespaceURI !== HTML) throw new Error('Foreign-namespace scripts are not static CSP inputs');
    if (executable(node)) texts.push((node.childNodes ?? []).map((child) => child.value ?? '').join(''));
  }
  if (forbiddenInlineMarkup(node))
    throw new Error('Static HTML must use linked styles and no inline event attributes');
  // Template contents and scripting-enabled noscript contents are inert; do not enter them.
  if (node.tagName !== 'template' && node.tagName !== 'noscript')
    for (const child of node.childNodes ?? []) inspectNode(child, texts);
}
/** parse5 normalizes CR/CRLF exactly as HTML parsing does; never trim, decode entities or serialize. */
export function collectExecutableScriptTexts(document: StaticHtmlNode): readonly string[] {
  const texts: string[] = [];
  inspectNode(document, texts);
  return texts;
}
