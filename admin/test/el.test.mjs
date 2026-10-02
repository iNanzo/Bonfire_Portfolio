// The admin under its Content Security Policy (admin/server/csp.js: style-src 'self'): a
// style attribute set by script is blocked there, so the flame swatches, table columns and
// palette and scene chips once drew blank on the deployed admin while working locally. el()
// now sets styles through the style object; these tests hold it to that, on a stand-in
// document: el() itself, every admin page's form rendered whole (no style or title attribute
// anywhere), and the sources (no style text handed to el(), no setAttribute('style'), no
// style="" in markup, no title).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { csp, securityHeaders } from '../server/csp.js';

// ---- a stand-in document: enough DOM for el() and the form ---------------------------------
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.styles = [];
    this.style = { setProperty: (name, value) => this.styles.push([name, String(value)]) };
    this.dataset = {};
    this.textContent = '';
    this.className = '';
    this.id = '';
    const classes = () => this.className.split(' ').filter(Boolean);
    this.classList = {
      add: (...c) => {
        this.className = [...new Set([...classes(), ...c])].join(' ');
      },
      remove: (...c) => {
        this.className = classes()
          .filter((x) => !c.includes(x))
          .join(' ');
      },
      contains: (c) => classes().includes(c),
    };
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  addEventListener() {}
  append(...kids) {
    for (const k of kids) if (typeof k === 'object') this.children.push(k);
  }
  replaceChildren(...kids) {
    this.children = [];
    this.append(...kids);
  }
  /** Every element under this one, depth first. */
  *all() {
    for (const c of this.children) {
      yield c;
      yield* c.all();
    }
  }
  /** Selectors the form uses: tag names, .class and [attribute], comma-separated (of "a .b", only the last part counts). */
  matches(sel) {
    return sel
      .split(',')
      .map((s) => s.trim().split(/\s+/).at(-1))
      .some((s) =>
        s.startsWith('[')
          ? this.attrs.has(s.slice(1, -1))
          : s.startsWith('.')
            ? this.classList.contains(s.slice(1))
            : this.tagName === s.toUpperCase(),
      );
  }
  querySelector(sel) {
    for (const n of this.all()) if (n.matches(sel)) return n;
    return null;
  }
  querySelectorAll(sel) {
    return [...this.all()].filter((n) => n.matches(sel));
  }
}
globalThis.document = { createElement: (tag) => new FakeElement(tag) };
const tree = (root) => [root, ...root.all()];
/** Source without its comments (they may well mention style="" or a title). */
const code = (src) => src.replace(/(^|\s)\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

const { el, styleEntries } = await import('../ui/el.js');

test('el() sets styles through the style object, never a style attribute', () => {
  const a = el('span', { class: 'swatch', style: 'background: #e0582a; --cols: 3' });
  assert.equal(a.attrs.has('style'), false);
  assert.deepEqual(a.styles, [
    ['background', '#e0582a'],
    ['--cols', '3'],
  ]);
  const b = el('i', { style: { background: '#000', '--cols': 2, marginLeft: '3px', color: null, border: '' } });
  assert.equal(b.attrs.has('style'), false);
  assert.deepEqual(
    b.styles,
    [
      ['background', '#000'],
      ['--cols', '2'],
      ['margin-left', '3px'],
    ],
    'camelCase to kebab-case; empty values skipped',
  );
  assert.deepEqual(
    styleEntries('background-image: url(data:image/png'),
    [['background-image', 'url(data:image/png']],
    'a value keeps its colons',
  );
  assert.deepEqual(styleEntries('; ;nonsense'), [], 'junk is skipped');
  const c = el(
    'button',
    { 'data-tip': 'Rename', 'aria-label': 'Rename it', hidden: true, onclick: () => {} },
    'x',
    null,
    false,
    el('b'),
  );
  assert.equal(c.getAttribute('data-tip'), 'Rename');
  assert.equal(c.children.length, 1, 'empty children skipped (text children are the DOM’s own)');
});

test('every admin page renders without a style or title attribute anywhere', async () => {
  const content = JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
  const { PAGES, defaultLabel } = await import('../ui/schema.js');
  const { getAt, renderFeatured, renderValue } = await import('../ui/form.js');
  const { flamesBlockTools, sceneBlockTools } = await import('../ui/paletteTools.js');
  const { scenesBlockTools } = await import('../ui/sceneTools.js');
  const { parsePath } = await import('../ui/paths.js');
  const ctx = {
    draft: content,
    uploads: new Map(),
    open: new WeakSet(),
    fresh: new WeakSet(),
    drag: null,
    focus: null,
    siteUrl: 'https://site.test/',
    preview: null,
    changed() {},
    toast() {},
    busy() {},
    thumb: () => 'blob:x',
    labelOf: defaultLabel,
  };
  const roots = [flamesBlockTools(ctx), sceneBlockTools(ctx), scenesBlockTools(ctx), renderFeatured(ctx)];
  for (const page of PAGES) {
    for (const key of page.keys) {
      if (key === 'featured') continue;
      const path = parsePath(key);
      roots.push(renderValue(getAt(content, path), path, ctx));
    }
  }
  const nodes = roots.flatMap(tree);
  assert.ok(nodes.length > 2000, `the whole admin rendered (${nodes.length} elements)`);
  for (const n of nodes) {
    assert.equal(n.attrs.has('style'), false, `${n.tagName}.${n.className}: no style attribute (the CSP blocks it)`);
    assert.equal(n.attrs.has('title'), false, `${n.tagName}.${n.className}: no title (data-tip shows hints)`);
  }
  // The swatches and the table columns still get their styles, through the style object.
  const swatches = nodes.filter((n) => n.className === 'swatch');
  assert.ok(swatches.length >= content.effects.flames.length * 5, 'a strip per flame');
  assert.ok(
    swatches.every((n) => n.styles.some(([k, v]) => k === 'background' && /^(#[0-9a-f]{6}|transparent)$/i.test(v))),
    'each swatch colored',
  );
  const tables = nodes.filter((n) => n.className === 'rows table');
  assert.ok(
    tables.length >= 2 && tables.every((n) => n.styles.some(([k]) => k === '--cols')),
    'tables know their column count',
  );
  const sceneStrips = nodes.filter((n) => n.className === 'swatches scene-swatches');
  assert.ok(
    sceneStrips.length && sceneStrips.every((s) => s.children.every((c) => c.styles.length)),
    'scene cards’ swatches too',
  );
  // (While it's all drawn: an image's two switches can be gone to, as the search finds them,
  // and say what they do; each folded More says what it's about to a screen reader.)
  const checks = nodes.filter((n) => n.className === 'check' && n.attrs.has('data-path'));
  for (const key of ['pixel', 'video'])
    assert.ok(
      checks.some((n) => n.getAttribute('data-path').endsWith(`.${key}`)),
      `an image’s ${key} switch`,
    );
  assert.ok(
    checks.every((n) => n.getAttribute('data-tip')),
    'each with its tip',
  );
  const mores = nodes.filter((n) => n.className === 'viz-more');
  assert.ok(mores.length >= 5, `a More per long explanation (${mores.length})`);
  for (const d of mores)
    assert.ok(
      d.children[0].children.some((c) => c.className === 'visually-hidden' && / about \S/.test(c.textContent)),
      'More, about what',
    );
  // A project's Problem is prose (a textarea); the interface's Problem heading is a line.
  const field = (path) => nodes.find((n) => n.getAttribute('data-path') === path);
  const i = content.projects.findIndex((p) => p.problem);
  assert.ok(field(`projects[${i}].problem`).querySelector('textarea'));
  assert.ok(
    field('ui.problem').querySelector('input') && !field('ui.problem').querySelector('textarea'),
    'ui.problem: one line',
  );
});

test('no admin source sets a style attribute or a title', () => {
  const dir = new URL('../ui/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(js|html)$/.test(f));
  assert.ok(files.includes('main.js') && files.includes('form.js'));
  for (const f of files) {
    const src = code(readFileSync(new URL(f, dir), 'utf8'));
    assert.doesNotMatch(src, /\bstyle:\s*[`'"]/, `${f}: style text handed to el() (use an object)`);
    assert.doesNotMatch(src, /setAttribute\(\s*['"]style['"]/, `${f}: setAttribute('style')`);
    assert.doesNotMatch(src, /\.style\.cssText|\.style\s*=[^=]/, `${f}: a whole style assigned`);
    assert.doesNotMatch(src, /\bstyle=["']|<style/, `${f}: style in markup`);
    if (f === 'schema.js') continue; // (data: a role's title is content, not an attribute)
    assert.doesNotMatch(
      src,
      /\btitle:\s*[`'"]|\btitle=["']|['"]title['"]\s*:|(?<!document)\.title\s*=[^=]/,
      `${f}: a title (use data-tip)`,
    );
  }
  // The admin puts the logo's markup in the page; it has no style either.
  const logo = readFileSync(new URL('../../src/ui/logo.js', import.meta.url), 'utf8').match(
    /export const logoMark[\s\S]*?;\n/,
  )[0];
  assert.doesNotMatch(logo, /style=/);
});

test('one policy for the Worker and admin:preview: no inline styles, the site the one frame', () => {
  const policy = csp('https://nhoang.dev/');
  assert.match(policy, /style-src 'self'(;|$)/);
  assert.match(policy, /frame-src https:\/\/nhoang\.dev(;|$)/);
  assert.match(policy, /default-src 'self'/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  assert.match(csp(''), /frame-src 'none'/);
  assert.match(csp('not a url'), /frame-src 'none'/);
  assert.match(
    csp('', { styleNonce: 'abc123' }),
    /style-src 'self' 'nonce-abc123'/,
    'the sign-in notice’s one <style>',
  );
  const h = securityHeaders('https://nhoang.dev/');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['Content-Security-Policy'], policy);
  for (const f of ['worker.js', 'vite.config.js']) {
    const src = code(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
    assert.match(src, /from '\.\/server\/csp\.js'/, `${f} uses the shared policy`);
    assert.doesNotMatch(src, /style-src|frame-ancestors/, `${f} has no policy of its own`);
  }
});
