// The admin's DOM builder: el('button', { class, text, onclick, style, …attributes }, …children).
// Text only ever goes in as textContent, never markup.
//
// Styles go through the style object (node.style.setProperty), never a style attribute: the
// deployed admin's Content Security Policy (admin/server/csp.js: style-src 'self') blocks
// every style="" a page sets, so a swatch given its color that way stays blank there while
// it works locally. `style` takes an object ({ background: '#e0582a', '--cols': 3 }, camelCase
// or kebab-case names) or the same as "name: value; name: value" text.
// No imports: the tests run it on a stand-in document.

/** @param {string} name a CSS property: camelCase becomes kebab-case; custom properties (--x) stay as they are */
const cssName = (name) => (name.startsWith('--') ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

/**
 * The declarations in a style object or "a: b; c: d" text, as [name, value] pairs (a value
 * keeps any ":" after the first, as in url(data:…)). Empty and nullish values are left out.
 * @param {string | Record<string, unknown>} style
 * @returns {[string, string][]}
 */
export function styleEntries(style) {
  const pairs = typeof style === 'string'
    ? style.split(';').map((d) => {
      const at = d.indexOf(':');
      return at < 0 ? ['', ''] : [d.slice(0, at), d.slice(at + 1)];
    })
    : Object.entries(style ?? {});
  return pairs
    .map(([k, v]) => /** @type {[string, string]} */ ([cssName(String(k).trim()), v === null || v === undefined ? '' : String(v).trim()]))
    .filter(([k, v]) => k && v !== '');
}

/**
 * Set styles on `node` through its style object (allowed under the CSP, unlike a style attribute).
 * @param {{ style: { setProperty: (name: string, value: string) => void } }} node
 * @param {string | Record<string, unknown>} style
 */
export function applyStyle(node, style) {
  for (const [name, value] of styleEntries(style)) node.style.setProperty(name, value);
}

/**
 * A new element with `props` (class, text, on<event> handlers, style, then properties for
 * non-string values the element has and attributes for the rest; null, undefined and false
 * skip a prop, true is an empty attribute) and `children` (nodes or text; empty slots skipped).
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...any} children
 * @returns {any}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') applyStyle(node, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
