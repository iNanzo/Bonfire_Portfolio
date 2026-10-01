// The admin app: loads content.json through the API, edits a draft of it, checks
// it live against src/contentRules.js, and saves it (with any new images) as one
// change. On GitHub that's a commit that redeploys the site; this page follows the
// deploy until it's live. Unsaved edits are kept in this browser until you save or
// discard them. The Effects page streams the draft into a live preview of the site.
import './admin.css';
import { imageRefs, SECTIONS, validateContent } from '../../src/contentRules.js';
import { DEFAULT_EFFECTS } from '../../src/effectsDefaults.js';
import { logoMark } from '../../src/ui/logo.js';
import { HELP, LABELS, PAGES } from './schema.js';
import { el, getAt, renderFeatured, renderValue, showErrors } from './form.js';
import { createPreview } from './preview.js';
import { flamesBlockTools, sceneBlockTools } from './paletteTools.js';
import { scenesBlockTools } from './sceneTools.js';
import { titleCase } from './text.js';

const DRAFT_KEY = 'nh-admin-draft';
const local = {
  get() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; } },
  set(v) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch { /* storage full or blocked: drafts are a convenience */ } },
  clear() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ } },
};
const q = (s, r = document) => r.querySelector(s);
/** replaceChildren, skipping empty slots (the DOM would print them as "null"). */
const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
const parsePath = (s) => [...s.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1]));
const within = (path, key) => path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`);
const pageOf = (path) => PAGES.find((p) => p.keys.some((k) => within(path, k))) ?? PAGES[0];

const state = { session: null, original: null, sha: null, errors: [], warnings: [], saving: false, deploy: null, deployTimer: 0 };
const ctx = {
  draft: null,
  uploads: new Map(), // src → { full, card, preview, file }: converted, not yet saved
  open: new WeakSet(),
  fresh: new WeakSet(),
  drag: null,
  focus: null,
  siteUrl: '',
  preview: null,
  changed,
  thumb: (src) => ctx.uploads.get(src)?.preview ?? `/api/image?src=${encodeURIComponent(src)}&card=1`,
  toast,
  busy,
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
const defaultLabel = (key) => titleCase(key.startsWith('page:') ? PAGES.find((p) => `page:${p.id}` === key)?.label ?? key : LABELS[key] ?? key);
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
    type: 'button', class: 'rename', title: 'Rename', 'aria-label': `Rename “${labelOf(key)}”`, text: '✎',
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
function renderNav() {
  const groups = [...new Set(PAGES.map((p) => p.group))];
  fill(q('[data-nav-list]'), groups.map((g) => el('li', { class: 'nav-group' },
    el('p', { class: 'nav-group-label', text: titleCase(g) }),
    el('ul', { role: 'list' }, PAGES.filter((p) => p.group === g).map((p) => el('li', {},
      el('a', { href: `#${p.id}`, 'data-nav': p.id, 'aria-current': currentPage() === p ? 'page' : null },
        el('span', { text: labelOf(`page:${p.id}`) }),
        el('span', { class: 'nav-count', 'data-count': p.id }))))))));
  countErrors();
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
      el('nav', { class: 'sidebar', 'aria-label': 'Sections' }, el('ul', { role: 'list', class: 'nav', 'data-nav-list': true }), el('div', { class: 'who', 'data-who': true })),
      el('main', { class: 'page', 'data-page': true, tabindex: '-1' }, el('p', { class: 'loading', text: 'Loading content…' })),
      el('div', { class: 'preview-slot', 'data-preview-slot': true, hidden: true })),
    el('div', { class: 'toasts', 'data-toasts': true, 'aria-live': 'polite' }),
    el('div', { class: 'busy', 'data-busy': true, hidden: true }, el('div', { class: 'busy-box' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), el('span', { 'data-busy-text': true }))));
}

function toast(message, kind = 'info') {
  const t = el('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status', text: message });
  q('[data-toasts]').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 8000 : 4000);
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

// ---- pages ----------------------------------------------------------------------------
const currentPage = () => PAGES.find((p) => `#${p.id}` === location.hash) ?? PAGES[0];
const anchorOf = (key) => `s-${key.replace(/\./g, '-')}`;

function block(key) {
  const path = parsePath(key);
  const value = getAt(ctx.draft, path);
  const effectsKey = key.startsWith('effects.') ? key.slice(8) : null;
  const reset = effectsKey && el('button', {
    type: 'button', class: 'link-button', text: 'Reset to Defaults',
    onclick: () => {
      if (!confirm(`Reset “${labelOf(key)}” to the original settings? (Discard still brings back your saved values until you save.)`)) return;
      ctx.draft.effects[effectsKey] = structuredClone(DEFAULT_EFFECTS[effectsKey]);
      changed({ rerender: true });
    },
  });
  return el('section', { class: 'block', 'data-path': key, id: anchorOf(key) },
    el('div', { class: 'block-head' }, renameable('h2', 'block-title', key), reset),
    HELP[key] ? el('p', { class: 'help', text: HELP[key] }) : null,
    key === 'effects.flames' ? flamesBlockTools(ctx) : key === 'effects.colors' ? sceneBlockTools(ctx) : key === 'scenes' ? scenesBlockTools(ctx) : null,
    el('p', { class: 'error', role: 'alert' }),
    key === 'featured' ? renderFeatured(ctx) : value === undefined ? missing(key) : renderValue(value, path, ctx));
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
    let path = ctx.focus;
    let target = main.querySelector(`[data-path="${CSS.escape(path)}"]`);
    while (!target && /(\.[^.[\]]+|\[\d+\])$/.test(path)) { // nearest rendered ancestor
      path = path.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
      target = main.querySelector(`[data-path="${CSS.escape(path)}"]`);
    }
    ctx.focus = null;
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.querySelector('input:not([type=file]):not([type=color]), textarea, select')?.focus({ preventScroll: true });
    }
  } else if (keepScroll) {
    window.scrollTo(0, y);
  }
}

// ---- live preview (Effects page) ---------------------------------------------------------
function showPreview(on) {
  const slot = q('[data-preview-slot]');
  slot.hidden = !on;
  q('[data-layout]').classList.toggle('has-preview', on);
  if (!on) return;
  if (!ctx.preview) {
    ctx.preview = createPreview(state.session?.siteUrl);
    slot.append(ctx.preview.pane);
  }
  ctx.preview.open();
  pushPreview();
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

function goToError(error) {
  const path = parsePath(error.path);
  let node = ctx.draft;
  for (const k of path) { // open every card on the way down
    node = node?.[k];
    if (node && typeof node === 'object' && !Array.isArray(node)) ctx.open.add(node);
  }
  const page = pageOf(error.path);
  ctx.focus = error.path;
  if (currentPage() !== page) location.hash = page.id; // hashchange renders
  else renderPage();
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
  if (!location.hash) history.replaceState(null, '', `#${PAGES[0].id}`);
  renderNav();
  validate();
  renderPage({ keepScroll: false });
  offerDraft();
  updateStatus();

  window.addEventListener('hashchange', () => {
    if (!PAGES.some((p) => `#${p.id}` === location.hash)) return; // in-page jump links
    const focusing = !!ctx.focus;
    renderPage({ keepScroll: focusing });
    if (!focusing) window.scrollTo(0, 0);
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) e.preventDefault(); });
}

boot();
