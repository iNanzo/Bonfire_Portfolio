// The admin app: loads content.json through the API, edits a draft of it, checks
// it live against src/contentRules.js, and saves it (with any new images) as one
// change. On GitHub that's a commit that redeploys the site; this page follows the
// deploy until it's live. Unsaved edits are kept in this browser until you save or
// discard them. The Look & Feel pages (Colors, Fire & Elements, Picture, Knight) stream
// the draft into a live preview of the site.
//
// Ctrl+K or / opens the search (search.js); a result, like a field that needs fixing, is
// gone to by reveal(): the cards on the way opened, its page shown, the field scrolled into
// view below the sticky bars, focused and flashed.
import './admin.css';
import { imageRefs, SECTIONS, validateContent } from '../../src/contentRules.js';
import { DEFAULT_EFFECTS } from '../../src/effectsDefaults.js';
import { logoMark } from '../../src/ui/logo.js';
import { installTooltips } from '../../src/ui/tooltip.js';
import { q, typing } from '../../src/ui/shell.js';
import { HELP, LABELS, PAGES, defaultLabel, moreFor, resolveHelp } from './schema.js';
import { el, getAt, moreBox, renderFeatured, renderValue, showErrors } from './form.js';
import { createPreview } from './preview.js';
import { flamesBlockTools, sceneBlockTools } from './paletteTools.js';
import { scenesBlockTools } from './sceneTools.js';
import { titleCase } from './text.js';
import { parsePath, parentKey, within } from './paths.js';
import { buildIndex, createSearch, pageById, pageOf, revealPlan } from './search.js';
import { resetMessage, resetSection } from './reset.js';

const DRAFT_KEY = 'nh-admin-draft';
const local = {
  get() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; } },
  set(v) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch { /* storage full or blocked: drafts are a convenience */ } },
  clear() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ } },
};
/** replaceChildren, skipping empty slots (the DOM would print them as "null"). */
const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));

const state = { session: null, original: null, sha: null, errors: [], warnings: [], saving: false, deploy: null, deployTimer: 0 };
const ctx = {
  draft: null,
  uploads: new Map(), // src → { full, card, preview, file }: converted, not yet saved
  open: new WeakSet(),
  fresh: new WeakSet(),
  drag: null,
  focus: null,
  flash: false,
  siteUrl: '',
  preview: null,
  changed,
  thumb: (src) => ctx.uploads.get(src)?.preview ?? `/api/image?src=${encodeURIComponent(src)}&card=1`,
  toast,
  busy,
  labelOf: (key) => labelOf(key),
};

async function api(path, init) {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON (e.g. an Access sign-in page) */ }
  if (!res.ok || !data) {
    const e = new Error(data?.error ?? (res.status === 401 || res.redirected ? 'Your sign-in expired. Reload the page.' : `Request failed (${res.status}).`));
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

// ---- labels (defaults in Title Case; any of them can be renamed) -----------------------
const labelOf = (key) => ctx.draft?.admin?.labels?.[key] || defaultLabel(key);

function setLabel(key, value) {
  const labels = { ...(ctx.draft.admin?.labels ?? {}) };
  if (!value || value === defaultLabel(key)) delete labels[key]; else labels[key] = value.slice(0, 60);
  if (Object.keys(labels).length) ctx.draft.admin = { ...(ctx.draft.admin ?? {}), labels };
  else if (ctx.draft.admin) {
    delete ctx.draft.admin.labels;
    if (!Object.keys(ctx.draft.admin).length) delete ctx.draft.admin;
  }
  renderNav();
  changed({ rerender: true });
}

/** A heading with a ✎ button that turns it into a text box (Enter saves, Esc cancels, empty resets). */
function renameable(tag, cls, key, id) {
  const heading = el(tag, { class: cls, id, text: labelOf(key) });
  const row = el('div', { class: 'title-row' }, heading);
  const button = el('button', {
    type: 'button', class: 'rename', 'data-tip': 'Rename', 'aria-label': `Rename “${labelOf(key)}”`, text: '✎',
    onclick: () => {
      const input = el('input', { type: 'text', class: `rename-input ${cls}`, maxlength: 60, 'aria-label': 'New name (empty resets it)', placeholder: defaultLabel(key) });
      input.value = labelOf(key);
      let done = false;
      const finish = (commit) => {
        if (done) return;
        done = true;
        if (commit) setLabel(key, input.value.trim());
        else row.replaceChildren(heading, button);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      row.replaceChildren(input);
      input.focus();
      input.select();
    },
  });
  row.append(button);
  return row;
}

// ---- shell ----------------------------------------------------------------------------
const search = createSearch({ entries: () => buildIndex(ctx.draft, { labelOf }), onPick: (key) => reveal(key) });

function renderNav() {
  const groups = [...new Set(PAGES.map((p) => p.group))];
  fill(q('[data-nav-list]'), groups.map((g) => el('li', { class: 'nav-group' },
    el('p', { class: 'nav-group-label', text: titleCase(g) }),
    el('ul', { role: 'list' }, PAGES.filter((p) => p.group === g).map((p) => el('li', {},
      el('a', { href: `#${p.id}`, 'data-nav': p.id, 'aria-current': currentPage() === p ? 'page' : null },
        el('span', { text: labelOf(`page:${p.id}`) }),
        el('span', { class: 'nav-count', 'data-count': p.id }))))))));
  countErrors();
  search.refresh();
}

function shell() {
  const app = q('#app');
  const brand = el('a', { class: 'brand', href: '#projects', 'aria-label': 'Admin home' });
  brand.innerHTML = logoMark('brand-mark'); // static markup from src/ui/logo.js, no user data
  brand.append(el('span', { class: 'brand-text', text: 'Admin' }));
  app.replaceChildren(
    el('header', { class: 'topbar' },
      brand,
      el('p', { class: 'status', 'data-status': true, role: 'status', 'aria-live': 'polite' }),
      el('div', { class: 'top-actions' },
        el('a', { class: 'button ghost', 'data-view-site': true, target: '_blank', rel: 'noopener', text: 'View Site ↗' }),
        el('button', { type: 'button', class: 'button ghost', 'data-discard': true, text: 'Discard', onclick: discard }),
        el('button', { type: 'button', class: 'button primary', 'data-save': true, onclick: save }, 'Save', el('kbd', { text: 'Ctrl S' })))),
    el('div', { class: 'notice', 'data-notice': true, hidden: true }),
    el('div', { class: 'layout', 'data-layout': true },
      el('nav', { class: 'sidebar', 'aria-label': 'Sections' }, search.root, el('ul', { role: 'list', class: 'nav', 'data-nav-list': true }), el('div', { class: 'who', 'data-who': true })),
      el('main', { class: 'page', 'data-page': true, tabindex: '-1' }, el('p', { class: 'loading', text: 'Loading content…' })),
      el('div', { class: 'preview-slot', 'data-preview-slot': true, hidden: true })),
    el('div', { class: 'toasts', 'data-toasts': true, 'aria-live': 'polite' }),
    el('div', { class: 'busy', 'data-busy': true, hidden: true }, el('div', { class: 'busy-box' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), el('span', { 'data-busy-text': true }))));
  watchSticky();
}

let toastId = 0;
/**
 * A note in the corner. `action` ([label, fn]) adds a button (Undo): the note then stays
 * longer, waits while it's pointed at or has the focus, and goes once it's used (or on Esc).
 * `focus`: the button takes the focus, as what comes next (Reset's Undo); `back()` gives
 * where the focus goes when the note goes with it.
 * @param {string} message @param {string} [kind] @param {[string, () => void] | null} [action]
 * @param {{ focus?: boolean, back?: () => HTMLElement | null }} [o]
 */
function toast(message, kind = 'info', action = null, { focus = false, back = () => null } = {}) {
  const text = el('span', { id: `toast-${++toastId}`, text: message });
  const t = el('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text);
  const life = action ? 12000 : kind === 'error' ? 8000 : 4000;
  let timer = 0;
  const done = () => {
    clearTimeout(timer);
    const had = t.contains(document.activeElement);
    t.remove();
    if (had) back()?.focus();
  };
  const wait = () => { clearTimeout(timer); timer = setTimeout(done, life); };
  if (action) {
    const button = el('button', {
      type: 'button', class: 'link-button toast-action', text: action[0], 'aria-describedby': text.id,
      onclick: () => { action[1](); done(); },
    });
    t.append(button);
    const held = () => t.matches(':hover') || t.contains(document.activeElement);
    t.addEventListener('pointerenter', () => clearTimeout(timer));
    t.addEventListener('focusin', () => clearTimeout(timer));
    t.addEventListener('pointerleave', () => { if (!held()) wait(); });
    t.addEventListener('focusout', (e) => { if (!t.contains(/** @type {Node | null} */ (e.relatedTarget)) && !t.matches(':hover')) wait(); });
    t.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(); } });
  }
  q('[data-toasts]').append(t);
  wait();
  if (focus) t.querySelector('button')?.focus();
}

function busy(on, message = 'Working…') {
  q('[data-busy]').hidden = !on;
  q('[data-busy-text]').textContent = message;
}

function notice(message, actions = []) {
  const n = q('[data-notice]');
  if (!message) { n.hidden = true; n.replaceChildren(); return; }
  n.hidden = false;
  n.replaceChildren(el('span', { text: message }), ...actions.map(([label, fn, cls = 'button ghost small']) => el('button', { type: 'button', class: cls, text: label, onclick: fn })));
}

/**
 * How much of the top of the window the sticky bars cover besides the top bar: the page
 * strip on a phone and the preview pinned over the page (narrower than 1280 px). Kept in
 * --sticky (and the strip's height in --nav-h), so jumps and reveals land below them, and
 * in `sticky.px`. Measured again whenever they change size, and at once by showPreview()
 * (the page scrolls to a revealed field before a ResizeObserver would have run).
 */
const sticky = { px: 0, measure: () => {} };
function watchSticky() {
  const root = document.documentElement;
  const nav = q('.sidebar');
  const slot = q('[data-preview-slot]');
  const narrow = matchMedia('(max-width: 860px)');
  const medium = matchMedia('(max-width: 1279px)');
  sticky.measure = () => {
    const strip = narrow.matches ? nav.offsetHeight : 0;
    const pinned = medium.matches && !slot.hidden ? slot.offsetHeight : 0;
    sticky.px = strip + pinned;
    root.style.setProperty('--nav-h', `${strip}px`);
    root.style.setProperty('--sticky', `${sticky.px}px`);
  };
  const ro = new ResizeObserver(() => sticky.measure());
  ro.observe(nav);
  ro.observe(slot);
  narrow.addEventListener('change', () => sticky.measure());
  medium.addEventListener('change', () => sticky.measure());
  sticky.measure();
}

/**
 * Scroll a revealed field (or card, group, section) into the part of the window the sticky
 * bars leave: centered there if it fits, else its top at the top of it (html's scroll-padding
 * is that edge).
 * @param {Element} target
 */
function bringIntoView(target) {
  const room = innerHeight - (q('.topbar').offsetHeight + sticky.px + 16);
  target.scrollIntoView({ block: target.getBoundingClientRect().height <= room ? 'center' : 'start' });
}

// ---- pages ----------------------------------------------------------------------------
const currentPage = () => pageById(location.hash.slice(1)) ?? PAGES[0];
const anchorOf = (key) => `s-${key.replace(/\./g, '-')}`;

/** A section's help, any page or field it names as named now, and its More. */
function blockHelp(key) {
  const o = { labelOf, draft: ctx.draft };
  const help = resolveHelp(HELP[key], o);
  const more = resolveHelp(moreFor(key), o);
  return [help ? el('p', { class: 'help', text: help }) : null, more ? moreBox(more, labelOf(key)) : null];
}

function block(key) {
  const path = parsePath(key);
  const value = getAt(ctx.draft, path);
  const effectsKey = key.startsWith('effects.') ? key.slice(8) : null;
  const reset = effectsKey && el('button', {
    // (Its name starts with the words it shows, for voice control; then which section.)
    type: 'button', class: 'link-button', 'data-reset': true, text: 'Reset Section', 'aria-label': `Reset Section: ${labelOf(key)}`,
    'data-tip': 'Back to the site’s defaults; Undo brings yours back (so does Discard, until you save).',
    onclick: () => resetBlock(key, effectsKey),
  });
  return el('section', { class: 'block', 'data-path': key, id: anchorOf(key), 'aria-labelledby': `${anchorOf(key)}-title` },
    el('div', { class: 'block-head' }, renameable('h2', 'block-title', key, `${anchorOf(key)}-title`), reset),
    ...blockHelp(key),
    key === 'effects.flames' ? flamesBlockTools(ctx) : key === 'effects.colors' ? sceneBlockTools(ctx) : key === 'scenes' ? scenesBlockTools(ctx) : null,
    el('p', { class: 'error', role: 'alert' }),
    key === 'featured' ? renderFeatured(ctx) : value === undefined ? missing(key) : renderValue(value, path, ctx));
}

/**
 * Reset a section of the effects to the defaults, with Undo (no question first). Flame
 * Colors keeps your own palettes (reset.js). The page draws again, so the focus goes to the
 * note's Undo, the next thing to want; Undo, or Esc, brings it back to the section's Reset.
 */
function resetBlock(key, effectsKey) {
  const before = structuredClone(ctx.draft.effects[effectsKey]);
  const result = resetSection(effectsKey, ctx.draft.effects[effectsKey], DEFAULT_EFFECTS[effectsKey]);
  ctx.draft.effects[effectsKey] = result.value;
  changed({ rerender: true });
  const back = () => q(`[data-path="${CSS.escape(key)}"] > .block-head [data-reset]`);
  toast(resetMessage(labelOf(key), result), 'info', ['Undo', () => {
    ctx.draft.effects[effectsKey] = before;
    changed({ rerender: true });
    toast(`“${labelOf(key)}” is as it was.`);
  }], { focus: true, back });
}

/** A section content.json doesn't have yet: the optional scenes start as an empty list on the first add. */
function missing(key) {
  if (key !== 'scenes') return el('p', { class: 'help', text: 'Missing from content.json.' });
  return el('div', { class: 'collection' },
    el('p', { class: 'help', text: 'No scenes yet: Bonfire Live plays its free show. Import some from the Painter, or add one.' }),
    el('button', { type: 'button', class: 'add', text: '+ Add Scene', onclick: () => {
      ctx.draft.scenes = [];
      ctx.changed({ rerender: true });
      q('[data-path="scenes"] .collection > .add')?.click();
    } }));
}

function renderPage({ keepScroll = true } = {}) {
  const page = currentPage();
  const main = q('[data-page]');
  const y = window.scrollY;
  const warnings = state.warnings.filter((w) => pageOf(w.path) === page);
  fill(main,
    el('header', { class: 'page-head' },
      renameable('h1', 'page-title', `page:${page.id}`),
      el('p', { class: 'page-blurb', text: page.blurb }),
      page.keys.length > 1 ? el('nav', { class: 'jump', 'aria-label': 'On this page' },
        page.keys.map((k) => el('a', { href: `#${anchorOf(k)}`, text: labelOf(k), onclick: (e) => { e.preventDefault(); q(`#${anchorOf(k)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }))) : null),
    warnings.length ? el('ul', { class: 'warnings', role: 'list' }, warnings.map((w) => el('li', { text: w.message }))) : null,
    ...page.keys.map(block));
  showErrors(main, state.errors);
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === page.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  showPreview(!!page.preview);
  if (ctx.focus) {
    let key = ctx.focus;
    let target = main.querySelector(`[data-path="${CSS.escape(key)}"]`);
    while (!target && parentKey(key)) { // nearest rendered ancestor
      key = parentKey(key);
      target = main.querySelector(`[data-path="${CSS.escape(key)}"]`);
    }
    const flash = ctx.flash;
    ctx.focus = null;
    ctx.flash = false;
    if (target) {
      bringIntoView(target);
      focusIn(target);
      if (flash) flashOnce(target);
    }
  } else if (keepScroll) {
    window.scrollTo(0, y);
  }
}

/** Focus what a revealed field or card offers: its input, or its card's toggle. */
function focusIn(target) {
  const own = target.matches('.card') ? target.querySelector(':scope > .card-head .card-toggle') : null;
  (own ?? target.querySelector('input:not([type=file]):not([type=color]), textarea, select, .card-toggle'))?.focus({ preventScroll: true });
}

/** A brief highlight on what a search or a jump landed on (none with reduced motion: no animation, no class left behind). */
function flashOnce(target) {
  target.classList.remove('is-flash');
  void target.offsetWidth; // (restart it if it's still going)
  target.classList.add('is-flash');
  const done = () => target.classList.remove('is-flash');
  target.addEventListener('animationend', done, { once: true });
  setTimeout(done, 1600);
}

/**
 * Go to a field (or a section, card or group) by its key: the cards on the way opened, its
 * page shown, then it's scrolled into view below the sticky bars, focused and (`flash`)
 * flashed. Errors and search results both come here.
 * @param {string} key
 * @param {{ flash?: boolean }} [o]
 */
function reveal(key, { flash = true } = {}) {
  const { page, opens } = revealPlan(ctx.draft, key);
  for (const node of opens) ctx.open.add(node);
  ctx.focus = key;
  ctx.flash = flash;
  if (currentPage() !== page) location.hash = page.id; // hashchange renders
  else renderPage();
}
const goToError = (error) => reveal(error.path, { flash: false });

// ---- live preview (the Look & Feel pages) ----------------------------------------------
function showPreview(on) {
  const slot = q('[data-preview-slot]');
  slot.hidden = !on;
  q('[data-layout]').classList.toggle('has-preview', on);
  if (on) {
    if (!ctx.preview) {
      ctx.preview = createPreview(state.session?.siteUrl);
      slot.append(ctx.preview.pane);
    }
    ctx.preview.open();
    pushPreview();
  }
  sticky.measure(); // (pinned or gone: the room below the bars changed)
}

function pushPreview() {
  if (!ctx.preview || q('[data-preview-slot]').hidden) return;
  const valid = !state.errors.some((e) => within(e.path, 'effects'));
  ctx.preview.update(structuredClone(ctx.draft.effects), { valid });
}

// ---- state -----------------------------------------------------------------------------
const isDirty = () => JSON.stringify(ctx.draft) !== JSON.stringify(state.original);

let validateTimer = 0;
let draftTimer = 0;
function changed({ rerender = false } = {}) {
  if (rerender) renderPage();
  clearTimeout(validateTimer);
  validateTimer = setTimeout(validate, rerender ? 0 : 120);
  clearTimeout(draftTimer);
  draftTimer = setTimeout(keepDraft, 600);
  updateStatus();
  search.refresh();
}

function countErrors() {
  const counts = {};
  for (const e of state.errors) { const id = pageOf(e.path).id; counts[id] = (counts[id] ?? 0) + 1; }
  for (const c of document.querySelectorAll('[data-count]')) c.textContent = counts[c.dataset.count] ? String(counts[c.dataset.count]) : '';
}

function validate() {
  const { errors, warnings } = validateContent(ctx.draft);
  // New images whose converted upload is gone (the page was reloaded before saving).
  const saved = imageRefs(state.original);
  for (const [name, list] of [['featured', [ctx.draft.featured]], ['projects', ctx.draft.projects], ['archive', ctx.draft.archive]]) {
    list.forEach((p, i) => (p?.images ?? []).forEach((im, j) => {
      if (!saved.has(im.src) && !ctx.uploads.has(im.src)) {
        errors.push({ path: `${name === 'featured' ? 'featured' : `${name}[${i}]`}.images[${j}]`, message: 'This new image’s upload was lost (the page reloaded before saving). Remove it and add it again.' });
      }
    }));
  }
  state.errors = errors;
  state.warnings = warnings;
  showErrors(q('[data-page]'), errors);
  countErrors();
  updateStatus();
  pushPreview();
}

function keepDraft() {
  if (isDirty()) local.set({ sha: state.sha, content: ctx.draft, at: Date.now() });
  else local.clear();
}

function updateStatus() {
  const dirty = isDirty();
  const status = q('[data-status]');
  q('[data-save]').disabled = !dirty || state.saving;
  q('[data-discard]').disabled = !dirty || state.saving;
  document.title = `${dirty ? '• ' : ''}Admin · Newton Hoang`;
  const d = state.deploy;
  let text = 'All changes saved';
  let link = null;
  let tone = 'ok';
  if (state.saving) { text = 'Saving…'; tone = 'busy'; }
  else if (dirty && state.errors.length) { text = `Unsaved · ${state.errors.length} field${state.errors.length > 1 ? 's need' : ' needs'} fixing`; tone = 'bad'; }
  else if (dirty) { text = 'Unsaved changes'; tone = 'warn'; }
  else if (d?.state === 'local') text = 'Saved to your files';
  else if (d?.state === 'pending') { text = 'Saved · waiting for the deploy to start…'; tone = 'busy'; link = d.commit?.url && ['commit', d.commit.url]; }
  else if (d?.state === 'deploying') { text = 'Saved · publishing to the site…'; tone = 'busy'; link = d.url && ['progress', d.url]; }
  else if (d?.state === 'live') { text = 'Live on the site'; link = state.session?.siteUrl && ['view', state.session.siteUrl]; }
  else if (d?.state === 'failed') { text = 'Saved, but the deploy failed'; tone = 'bad'; link = d.url && ['details', d.url]; }
  status.dataset.tone = tone;
  fill(status, el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { text }),
    link ? el('a', { href: link[1], target: '_blank', rel: 'noopener', text: `${link[0]} ↗` }) : null);
}

// ---- save --------------------------------------------------------------------------------
function summarize(uploadCount) {
  const differs = (k) => JSON.stringify(ctx.draft[k]) !== JSON.stringify(state.original[k]);
  const changedKeys = SECTIONS.filter(differs);
  const parts = [];
  if (changedKeys.length) parts.push(`edit ${changedKeys.map((k) => (k === 'effects' ? 'effects' : (LABELS[k] ?? k).toLowerCase())).join(', ')}`);
  if (differs('scenes')) parts.push('edit scenes');
  if (differs('admin')) parts.push('rename admin labels');
  if (uploadCount) parts.push(`add ${uploadCount} image${uploadCount > 1 ? 's' : ''}`);
  const removed = [...imageRefs(state.original)].filter((src) => !imageRefs(ctx.draft).has(src)).length;
  if (removed) parts.push(`remove ${removed} image${removed > 1 ? 's' : ''}`);
  const text = parts.join('; ') || 'update content';
  return text[0].toUpperCase() + text.slice(1);
}

async function save() {
  if (state.saving || !isDirty()) return;
  clearTimeout(validateTimer);
  validate();
  if (state.errors.length) {
    toast(`${state.errors.length} field${state.errors.length > 1 ? 's need' : ' needs'} fixing before saving.`, 'error');
    goToError(state.errors[0]);
    return;
  }
  const refs = imageRefs(ctx.draft);
  const uploads = [...ctx.uploads].filter(([src]) => refs.has(src)).map(([src, u]) => ({ src, full: u.full, card: u.card }));
  state.saving = true;
  updateStatus();
  try {
    const result = await api('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseSha: state.sha, content: ctx.draft, uploads, message: summarize(uploads.length) }),
    });
    state.original = structuredClone(ctx.draft);
    state.sha = result.contentSha;
    for (const u of ctx.uploads.values()) URL.revokeObjectURL(u.preview);
    ctx.uploads.clear();
    local.clear();
    if (result.commit?.sha) {
      state.deploy = { state: 'pending', commit: result.commit };
      followDeploy();
      toast('Saved. Publishing to the site — usually about a minute.');
    } else {
      state.deploy = { state: 'local' };
      toast('Saved to your files.');
    }
    renderPage();
  } catch (e) {
    if (e.status === 409) conflict(e.message);
    else if (e.status === 422 && e.data?.errors) { state.errors = e.data.errors; showErrors(q('[data-page]'), state.errors); goToError(state.errors[0]); toast(e.message, 'error'); }
    else toast(e.message, 'error');
  } finally {
    state.saving = false;
    updateStatus();
  }
}

function followDeploy() {
  clearTimeout(state.deployTimer);
  const started = Date.now();
  const tick = async () => {
    const commit = state.deploy?.commit;
    if (!commit) return;
    try { state.deploy = { ...state.deploy, ...(await api(`/api/deploy?commit=${commit.sha}`)) }; } catch { /* try again */ }
    updateStatus();
    if (state.deploy.state === 'live') toast('Your changes are live.');
    if (['live', 'failed'].includes(state.deploy.state) || Date.now() - started > 10 * 60 * 1000) return;
    state.deployTimer = setTimeout(tick, 5000);
  };
  state.deployTimer = setTimeout(tick, 4000);
}

async function load() {
  const { content, sha } = await api('/api/content');
  state.original = content;
  state.sha = sha;
  ctx.draft = structuredClone(content);
}

function conflict(message) {
  notice(message, [
    ['Load the latest (drop my edits)', async () => {
      notice(null);
      await load();
      ctx.uploads.clear();
      local.clear();
      validate();
      renderNav();
      renderPage({ keepScroll: false });
    }],
    ['Save mine over it', async () => {
      notice(null);
      const { sha } = await api('/api/content');
      state.sha = sha;
      save();
    }],
  ]);
}

function discard() {
  if (!isDirty() || !confirm('Discard all unsaved changes?')) return;
  ctx.draft = structuredClone(state.original);
  for (const u of ctx.uploads.values()) URL.revokeObjectURL(u.preview);
  ctx.uploads.clear();
  local.clear();
  validate();
  renderNav();
  renderPage();
}

function offerDraft() {
  const saved = local.get();
  if (!saved?.content || JSON.stringify(saved.content) === JSON.stringify(state.original)) return local.clear();
  const when = new Date(saved.at).toLocaleString();
  const same = saved.sha === state.sha;
  const restore = () => {
    ctx.draft = saved.content;
    notice(null);
    validate();
    renderNav();
    renderPage();
    toast('Draft restored. New images from that session need adding again.');
  };
  notice(same
    ? `You have unsaved edits from ${when}.`
    : `You have unsaved edits from ${when}, made before the content last changed. Restoring them would undo the newer changes.`,
  [[same ? 'Restore them' : 'Restore anyway', restore, 'button primary small'], ['Discard them', () => { local.clear(); notice(null); }]]);
}

// ---- boot --------------------------------------------------------------------------------
/** An old page address (#effects) becomes its page's (#colors), without a history step. */
function canonicalHash() {
  const page = pageById(location.hash.slice(1));
  if (page && location.hash !== `#${page.id}`) history.replaceState(null, '', `#${page.id}`);
  return page;
}

async function boot() {
  shell();
  try {
    const [session] = await Promise.all([api('/api/session'), load()]);
    state.session = session;
    ctx.siteUrl = session.siteUrl;
  } catch (e) {
    q('[data-page]').replaceChildren(el('p', { class: 'loading', text: `Couldn’t load the content: ${e.message}` }));
    return;
  }
  const s = state.session;
  q('[data-view-site]').href = s.siteUrl || '/';
  fill(q('[data-who]'),
    el('p', { text: s.mode === 'local' ? 'Local Mode' : s.email }),
    el('p', { class: 'muted', text: s.mode === 'local' ? 'Saves write to your files; nothing is committed.' : `Saves to ${s.store}` }),
    s.mode === 'local' ? null : el('a', { href: '/cdn-cgi/access/logout', text: 'Sign Out' }));
  if (!canonicalHash()) history.replaceState(null, '', `#${PAGES[0].id}`);
  renderNav();
  validate();
  renderPage({ keepScroll: false });
  offerDraft();
  updateStatus();

  window.addEventListener('hashchange', () => {
    if (!canonicalHash()) return; // in-page jump links
    const focusing = !!ctx.focus;
    renderPage({ keepScroll: focusing });
    if (!focusing) window.scrollTo(0, 0);
  });
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (mod && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); search.focus(); }
    else if (e.key === '/' && !mod && !e.altKey && !typing(e.target) && !document.querySelector('dialog[open]')) { e.preventDefault(); search.focus(); }
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) e.preventDefault(); });
}

installTooltips();
boot();
