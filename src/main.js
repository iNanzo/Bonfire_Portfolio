import './styles.css';
import { applyCssPalette, base, flames, flameOr, rotation } from './palette.js';
import { site, screens, hero, ui, weapons, startingEquipment, items, drawnWeapons } from './content.js';
import { effects, onEffects, setEffects } from './effects.js';
import { drawElement, elementOr, flameTitle } from './elements.js';
import { STRUCTURAL, ELEMENT_IDS } from './effectsDefaults.js';
import {
  renderChrome, renderHome, renderProjects, renderExperience,
  renderSkills, renderAbout, renderContact, sceneLabel, MENU_TEXT,
} from './render.js';
import { installDitherPatterns } from './ui/dither.js';
import { installTooltips } from './ui/tooltip.js';
import { failScene as markSceneFailed, q, qa } from './ui/shell.js';
import { createKeysOverlay, isHelpKey } from './ui/keysOverlay.js';
import { SITE_KEYS } from './ui/siteKeys.js';
import { setSound, blip, forgeHum } from './ui/audio.js';
import { gridNav, listNav } from './ui/spatial.js';
import { setupRestMenu } from './ui/restMenu.js';
import { setupInventory } from './ui/inventory.js';
import { createDiscoveries } from './ui/discoveries.js';
import { createPhotoMode } from './ui/photo.js';
import { createBreakdown, BREAKDOWN_HASH } from './ui/breakdown.js';
import { createRenderMenu } from './ui/renderMenu.js';
import { createPack, bonfireItems } from './ui/pack.js';
import { HELMET_NAMES, GESTURE_NAMES, STYLE_NAMES, FINISH_NAMES, greeting } from './knightNames.js';
import { SCENERIES } from './sceneries.js';
import { applyFlame, setAccentRamp } from './ui/theme.js';
import { parseRoute, readRoute, routePath, isEditing } from './routes.js';
import { updateMetadata } from './seo.js';
import { pick } from './math.js';
import { esc } from './html.js';
const BASE = import.meta.env.BASE_URL;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;
/** The admin's live preview: this page in its frame, the draft's effects streamed in (the end of this file). */
const previewing = new URLSearchParams(location.search).has('preview') && window.parent !== window;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

document.documentElement.classList.add('js');
if (touch) document.documentElement.classList.add('touch');
applyCssPalette();
applyFlame(startingEquipment.flame);
installDitherPatterns(base);
installTooltips();

// --- Render ---------------------------------------------------------------------------
const app = document.getElementById('app');
app.innerHTML = `
  ${renderChrome()}
  <main id="main" class="screens" tabindex="-1">
    ${renderHome()}
    ${renderProjects()}
    ${renderExperience()}
    ${renderSkills()}
    ${renderAbout()}
    ${renderContact()}
  </main>
`;
const screenEls = Object.fromEntries(qa('[data-screen]').map((el) => [el.dataset.screen, el]));
const live = q('[data-live]');
const header = q('[data-header]');
const inventory = setupInventory(screenEls.projects, { reducedMotion });
if (touch) q('[data-stoke-hint]').textContent = hero.stokeHint.touch;

// --- Discoveries (ui/discoveries.js): a toast for each new one, the count in the menu ------
const toast = q('[data-toast]');
let toastTimer = 0;
function showToast(kicker, text) {
  q('[data-toast-kicker]', toast).textContent = kicker;
  q('[data-toast-text]', toast).textContent = text;
  toast.hidden = true;
  void toast.offsetWidth; // (restart the entrance)
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}
const discoveries = createDiscoveries({
  onNew: (d, n, total) => {
    showToast(`${ui.discovery} ${n} / ${total}`, d.name);
    blip('kindle');
    drawDiscoveryCount();
  },
});
const discover = (id) => discoveries.discover(id);
function drawDiscoveryCount() {
  qa('[data-discovery-count]').forEach((el) => { el.textContent = `${discoveries.count} / ${discoveries.total}`; });
}
drawDiscoveryCount();
const discoveriesDialog = q('[data-discoveries]');
function openDiscoveries() {
  q('[data-discovery-list]', discoveriesDialog).innerHTML = discoveries.list.map((d) => {
    const found = discoveries.has(d.id);
    return `<li class="discovery${found ? ' is-found' : ''}"><span class="discovery-mark" aria-hidden="true">${found ? '&#9670;' : '&#9671;'}</span>
      <span><b>${found ? esc(d.name) : '???'}</b>${found ? '' : `<span class="discovery-hint">${esc(d.hint)}</span>`}</span>
      <span class="visually-hidden">${found ? 'found' : 'not found yet'}</span></li>`;
  }).join('');
  discoveriesDialog.showModal();
  // Focus on Close (the one thing to press), but the list from its top: its title, the count
  // and the first ones in sight, not scrolled down to where Close is.
  q('[data-discoveries-close]', discoveriesDialog).focus({ preventScroll: true });
  q('[data-discoveries-scroll]', discoveriesDialog).scrollTop = 0;
}
discoveriesDialog.addEventListener('click', (e) => {
  if (e.target === discoveriesDialog || e.target.closest('[data-discoveries-close]')) discoveriesDialog.close();
});
// Every flame palette seen counts toward one discovery.
const flamesSeen = new Set((store.get('flamesSeen') ?? '').split(',').filter(Boolean));
function sawFlame(key) {
  if (flamesSeen.has(key)) return;
  flamesSeen.add(key);
  store.set('flamesSeen', [...flamesSeen].join(','));
  if (rotation().every((k) => flamesSeen.has(k))) discover('palettes');
}

// --- The render settings (P: ui/renderMenu.js) --------------------------------------------
// One menu in two places: a HUD in the corner, or folded into the breakdown's panel while
// that's open (the HUD would sit behind it). Opening one while the other shows hands over.
// The cursor's pick (how the pointer stirs the fire) is remembered in this browser, in the
// same place ?lab keeps its pick; the rest is the site's look again on a reload.
const CURSOR_KEY = 'fireInteraction';
const renderSettings = {
  title: ui.renderMenu ?? 'Render Settings',
  read: () => fire?.describe() ?? null,
  pick: (id, dir) => {
    const values = fire?.cycle(id, dir);
    if (id === 'interaction' && fire) store.set(CURSOR_KEY, fire.interaction);
    return values;
  },
  // Back to the site's own look (the effects in content.json; the cursor's pick forgotten).
  // Not mid-swap: it would also settle the colors the new weapon is bringing in.
  reset: {
    key: '0', label: ui.renderReset ?? 'Reset Render Settings', hint: 'the site’s look',
    run: () => { fire?.applyEffects(); store.remove(CURSOR_KEY); },
    disabled: () => !fire || fire.forging,
  },
  onSound: (what) => blip(what === 'open' ? 'select' : what),
  onToggle: (open) => { if (open) discover('render'); },
};
const hud = createRenderMenu({ ...renderSettings, className: 'debug-hud' });
app.append(hud.el);
/** Render Settings from the rest menu (a touch screen's way in): the breakdown's fold while that's open, else the HUD. */
function openRenderSettings() {
  if (!fire) return;
  (breakdown.active ? breakdown.render : hud).open({ focus: true });
}

// --- Keyboard shortcuts (?): every key the site answers, in one list (ui/siteKeys.js) -------
const keysOverlay = createKeysOverlay({ title: MENU_TEXT.keys, groups: SITE_KEYS });

// --- Photo mode and "How it's made" (ui/photo.js, ui/breakdown.js). Created before the
// page's own keys, so their Esc closes them without also going back a screen.
const photo = createPhotoMode({
  getFire: () => fire,
  onExit: () => fire?.setView(route.screen === 'projects' && route.item ? 'inspect' : route.screen),
  onColors: () => { const fresh = rotation().filter((k) => k !== equipment.flame); equip(equipment.weapon, pick(fresh), equipment.item, { instant: true }); },
  onElement: () => {
    const next = ELEMENT_IDS[(ELEMENT_IDS.indexOf(equipment.element) + 1) % ELEMENT_IDS.length]; // (in the order its tooltip names them)
    equip(pick(weaponKeys.filter((k) => k !== equipment.weapon)), equipment.flame, equipment.item, { element: next });
  },
  onEnter: () => { breakdown.exit(); discover('photo'); },
  touch,
});
// Closing the breakdown hands its open render settings back to the HUD only where P can
// close that again: on touch screens there's no key for it, so they just fold away.
const breakdown = createBreakdown({
  getFire: () => fire,
  render: renderSettings,
  onEnter: () => {
    photo.exit();
    if (hud.isOpen) { hud.close({ quiet: true }); breakdown.render.open({ quiet: true }); }
    pack.refresh(); // (it steps aside: its list, if one's showing, fits where it goes)
    discover('breakdown');
  },
  onExit: () => {
    if (breakdown.render.isOpen) {
      breakdown.render.close({ quiet: true });
      if (!touch) hud.open({ quiet: true });
    }
    pack.refresh();
  },
});
// A link to the breakdown (the Portfolio project's "Take This Page Apart", or the address
// itself) opens it now, or once the scene has loaded. Without WebGL there's nothing to take
// apart (failScene hides the ways in).
let wantsBreakdown = false;
function openBreakdown() {
  if (fire) breakdown.enter();
  else if (!document.documentElement.classList.contains('no-webgl')) wantsBreakdown = true;
}

// --- Equipment (weapon + flame + element in the fire) ---------------------------------------
const weaponKeys = drawnWeapons(); // (the ones in the random draw: the admin can switch some off)
const startElement = () => elementOr(startingEquipment.element);
// Requested state drives future choices; displayed state changes only at impact.
let equipment = { ...startingEquipment, element: startElement(), item: null };
let displayedEquipment = { ...equipment };
let fire = null; // set once the 3D scene module loads
const fireName = (eq) => flameTitle(flames[eq.flame]?.name, eq.element);
const equipLabel = () => `${weapons[displayedEquipment.weapon]} · ${fireName(displayedEquipment)}`;

// The E badge follows the latest request (it moves on click); the weapon and
// flame labels follow what's actually in the fire (they change at impact).
function refreshEquipLabels() {
  inventory.markEquipped(equipment.item);
  inventory.setWield(equipLabel());
  qa('[data-equip-label]').forEach((el) => { el.textContent = equipLabel(); });
}
refreshEquipLabels();

let stopHum = () => {}; // the forge hum of the swap under way (ui/audio.js)
function equip(weapon, flame, item, { instant = false, element = equipment.element } = {}) {
  const same = equipment.weapon === weapon && equipment.flame === flame && equipment.element === element;
  equipment = { weapon, flame, element, item };
  inventory.markEquipped(item);
  if (!fire) {
    // Scene not loaded yet (or no WebGL): theme now; the scene catches up on load.
    displayedEquipment = { ...equipment };
    if (!same) applyFlame(flame);
    refreshEquipLabels();
    return;
  }
  if (!same && !instant) {
    blip('pull');
    stopHum();
    stopHum = forgeHum(fire.swapTime);
  }
  fire.equip(weapon, flame, { instant, item, element, rush: true }).catch(failScene);
}

/** Inspecting a project draws a random weapon and flame (never the same as now), and an element by weight. */
function rollFor(item) {
  const fresh = rotation().filter((k) => k !== equipment.flame && k !== startingEquipment.flame);
  equip(
    pick(weaponKeys.filter((k) => k !== equipment.weapon && k !== startingEquipment.weapon)),
    pick(fresh.length ? fresh : Object.keys(flames)),
    item,
    { element: drawElement(startElement()) },
  );
}
const goHome = () => equip(startingEquipment.weapon, startingEquipment.flame, null, { element: startElement() });

function onImpact(flame, _from, instant, selection) {
  displayedEquipment = { ...selection };
  if (!instant) { discover(selection.element ?? 'fire'); sawFlame(flame); } // (not the page's own first setup)
  document.documentElement.dataset.flame = flame;
  document.documentElement.dataset.element = selection.element ?? 'fire';
  if (instant) applyFlame(flame); // otherwise the scene eases the accents via onRamp
  refreshEquipLabels();
  if (!instant) {
    // Each element lands with its own sound.
    stopHum();
    const el = selection.element ?? 'fire';
    blip(el === 'fire' ? 'stab' : `stab-${el}`);
    live.textContent = `The fire takes the ${weapons[displayedEquipment.weapon]}. ${fireName(displayedEquipment)}.`;
  }
  pack.refresh();
}

// --- Router --------------------------------------------------------------------------------
const order = screens.map((s) => s.id);
let route = { screen: null, item: null };

const parseHash = () => readRoute(location, BASE);

function go(hash) {
  const next = parseRoute(hash);
  const pathname = routePath(next, BASE);
  if (location.pathname !== pathname || location.hash) history.pushState(null, '', pathname + location.search);
  render(next, true);
}

// Screen changes (styles.css "Switching screens"): the old screen stays up for a moment,
// fixed where it was, while its panels dither away; the new one's slide in from the way
// you're going (Q/E, or a tab to the left or right of this one).
let leaving = null;
let leaveTimer = 0;
let lastScrollY = 0; // (the page's scroll, for the fire's sweep: see "Scrolling" below)
let stepDir = 0; // set by step() for the one render it triggers (it wraps around the ends)
function finishLeaving() {
  clearTimeout(leaveTimer);
  if (!leaving) return;
  leaving.classList.remove('is-leaving');
  leaving.style.top = '';
  if (leaving.dataset.screen !== route.screen) leaving.hidden = true;
  leaving = null;
}
/** Number the panel's first lines (--k) so they rise in one after another. */
function stagger(screen) {
  for (const panel of screen.querySelectorAll('.panel, .home-copy')) {
    let k = 0;
    for (const child of panel.children) {
      if (child.classList.contains('corner') || child.classList.contains('screen-head')) continue;
      if (k < 8) child.style.setProperty('--k', k++);
      else child.style.removeProperty('--k');
    }
  }
}

function render(next, user) {
  const prev = route;
  route = next;
  const changedScreen = prev.screen !== next.screen;

  // Screen visibility + entrance (and the old one's exit).
  finishLeaving();
  const scrolled = window.scrollY;
  for (const [id, el] of Object.entries(screenEls)) el.hidden = id !== next.screen;
  const el = screenEls[next.screen];
  if (changedScreen) {
    const dir = stepDir || Math.sign(order.indexOf(next.screen) - order.indexOf(prev.screen)) || 1;
    stepDir = 0;
    for (const s of Object.values(screenEls)) s.style.setProperty('--dir', dir);
    if (user && prev.screen && !reducedMotion) {
      leaving = screenEls[prev.screen];
      leaving.hidden = false;
      leaving.style.top = `${-scrolled}px`;
      leaving.classList.add('is-leaving');
      leaveTimer = setTimeout(finishLeaving, 220);
    }
    stagger(el);
    el.classList.remove('is-entering');
    void el.offsetWidth;
    el.classList.add('is-entering');
    window.scrollTo({ top: 0, behavior: 'instant' });
    lastScrollY = 0; // (the jump to the top isn't a scroll to sweep the fire with)
  }
  document.body.dataset.screen = next.screen;
  qa('[data-tab]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === next.screen));
  qa('[data-tab][aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
  placeTabCursor();

  document.body.classList.toggle('is-inspecting', next.screen === 'projects' && !!next.item);

  // Inventory browse / inspect.
  if (next.screen === 'projects') {
    const inspect = !!next.item;
    screenEls.projects.dataset.mode = inspect ? 'inspect' : 'browse';
    document.body.classList.toggle('is-inspecting', inspect);
    if (inspect) {
      inventory.open(next.item);
      discover(`project:${next.item}`);
      if (user || prev.item !== next.item) rollFor(next.item);
    }
  }

  // Home puts the base longsword and ember flame back.
  if (next.screen === 'home') goHome();

  // Camera.
  fire?.setView(next.screen === 'projects' && next.item ? 'inspect' : next.screen, { instant: !user && !prev.screen });

  // Title + focus for keyboard and screen reader users.
  const meta = screens.find((s) => s.id === next.screen);
  const itemName = next.item ? items().find((p) => p.id === next.item)?.name : null;
  updateMetadata(next, BASE);
  if (user && prev.screen) {
    live.textContent = itemName ? `${itemName}, item details` : `${meta.label}`;
    let target = next.item ? q('#detail-title') : q(`#${next.screen === 'home' ? 'home' : next.screen}-title`);
    if (next.screen === 'projects' && !next.item && prev.item) target = inventory.slotFor(prev.item) ?? target;
    target?.focus({ preventScroll: true });
  }
}

// Native links remain crawlable and open correctly in new tabs. Only ordinary
// same-origin route clicks are enhanced into in-place navigation.
function syncRoute(user = true) {
  const breakdownLink = location.hash === BREAKDOWN_HASH; // (the address loses it just below)
  const next = parseHash();
  history.replaceState(null, '', routePath(next, BASE) + location.search);
  if (breakdownLink) openBreakdown();
  if (breakdownLink && route.screen === next.screen && route.item === next.item) return; // (only the breakdown was asked for)
  render(next, user);
}
window.addEventListener('popstate', () => syncRoute());
window.addEventListener('hashchange', () => syncRoute());
document.addEventListener('click', (event) => {
  const a = event.target.closest('a');
  if (!a || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || a.target || a.hasAttribute('download')) return;
  // A link to #how-its-made (the Portfolio project's page) opens the breakdown in place.
  if (a.hash === BREAKDOWN_HASH) {
    event.preventDefault();
    openBreakdown();
    return;
  }
  if (a.classList.contains('skip-link')) {
    event.preventDefault();
    q('#main').focus();
    return;
  }
  const destination = new URL(a.href);
  if (destination.origin !== location.origin || !destination.pathname.startsWith(BASE)) return;
  const legacy = destination.hash.startsWith('#/');
  const relative = destination.pathname.slice(BASE.length);
  const next = parseRoute(legacy ? destination.hash : relative);
  if (!legacy && routePath(next, BASE) !== destination.pathname) return;
  event.preventDefault();
  go(legacy ? destination.hash : relative);
  blip('select');
});
syncRoute(false);

// --- Keyboard: Q/E switch screens, Esc goes back, ? lists every key -------------------------
// (Shift with a letter isn't one of the site's keys: only ?, which is Shift+/ on most keyboards.)
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || isEditing(e.target) || document.querySelector('dialog[open]')) return;
  if (isHelpKey(e)) { e.preventDefault(); keysOverlay.open(); return; }
  if (e.shiftKey) return;
  const k = e.key.toLowerCase();
  if (k === 'f') { photo.toggle(); return; }
  if (k === 'b') { breakdown.toggle(); return; }
  if (k === 'i' && !photo.active) { pack.toggle(); return; } // (the pack stays in the breakdown)
  if (photo.active || breakdown.active) return;
  if (k === 'q' || k === 'e') step(k === 'e' ? 1 : -1);
  else if (e.key === 'Escape') {
    if (!q('[data-kindled]').hidden) return;
    if (route.screen === 'projects' && route.item) go('#/projects');
    else if (route.screen !== 'home') go('#/');
  }
});
// The render settings' keys (P, and while it's open 1–6 and 0): listened for from the start,
// and nothing until the scene is there. The breakdown takes them first while it's open (its
// own fold of the menu).
window.addEventListener('keydown', (e) => {
  if (!fire || breakdown.active || isEditing(e.target) || document.querySelector('dialog[open]')) return;
  if (hud.handleKey(e)) e.preventDefault();
});

// --- Header, rest menu, sound ---------------------------------------------------------------
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);

// Scrolling sweeps the fire's loose particles and the fireflies a little the way the page
// moves (scene.js scroll): the wheel with a mouse (so it's felt on screens that don't
// scroll, like home), the page's own scroll on touch screens. Not in photo mode (there the
// wheel zooms), and not for the jump to the top when the screen changes (render()).
lastScrollY = window.scrollY;
window.addEventListener('wheel', (e) => {
  if (touch || photo.active) return;
  fire?.scroll(e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY);
}, { passive: true });
window.addEventListener('scroll', () => {
  const dy = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;
  if (touch && dy) fire?.scroll(dy);
}, { passive: true });

// The current tab's underline glides from tab to tab (hidden on home, where no tab is current).
function placeTabCursor() {
  const cursor = q('[data-tabs-cursor]');
  const current = q('[data-tab][aria-current]');
  if (!cursor) return;
  cursor.hidden = !current || !current.offsetWidth;
  if (cursor.hidden) return;
  cursor.style.width = `${current.offsetWidth}px`;
  cursor.style.transform = `translateX(${current.offsetLeft}px)`;
  q('.tabs').classList.add('has-cursor');
}
window.addEventListener('resize', placeTabCursor);
document.fonts?.ready.then(placeTabCursor);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

listNav(q('.tabs'), 'a', { horizontal: true, onMove: () => blip('move') });
listNav(q('[data-title-menu]'), '[data-title-item]', { onMove: () => blip('move') });

// The rest menu (ui/restMenu.js; the Menu button, at every width): Go To and Tools. Not the
// keyboard shortcuts on a touch screen: a list of keys there are none of to press (and its
// filter would bring up the on-screen keyboard over it).
if (touch) q('[data-menu-action="keys"]').closest('li').hidden = true;
setupRestMenu({
  menu: q('[data-menu]'), opener: q('[data-menu-open]'), onSound: blip,
  actions: { photo: () => photo.enter(), breakdown: () => breakdown.enter(), render: openRenderSettings, discoveries: openDiscoveries, keys: () => keysOverlay.open() },
});

// The Q / E keys are buttons too (the same step through the screens).
function step(dir) {
  const i = order.indexOf(route.screen);
  const nextId = order[(i + dir + order.length) % order.length];
  stepDir = dir;
  go(nextId === 'home' ? '#/' : `#/${nextId}`);
}
qa('[data-step]').forEach((b) => b.addEventListener('click', () => { step(Number(b.dataset.step)); blip('select'); }));

// Sound: the label says what it is now ("Sound: Off"), the tooltip what a click does.
const soundButtons = qa('[data-sound]');
function applySound(on) {
  on = setSound(on);
  soundButtons.forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    q('[data-sound-label]', b).textContent = on ? ui.soundOn : ui.soundOff;
  });
  store.set('sound', on ? '1' : '0');
}
soundButtons.forEach((b) => b.addEventListener('click', () => {
  const on = b.getAttribute('aria-pressed') !== 'true';
  applySound(on);
  if (on) { blip('select'); discover('sound'); }
}));
if (store.get('sound') === '1') {
  // Remembered as on: the switch says so at once; browsers only let the audio itself start
  // with the first click or key press.
  soundButtons.forEach((b) => {
    b.setAttribute('aria-pressed', 'true');
    q('[data-sound-label]', b).textContent = ui.soundOn;
  });
  const resume = () => { applySound(true); window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}

// --- The résumé: its links show once there's a file to open (public/resume.pdf, or a link) --
if (site.resumeUrl) {
  const show = () => { qa('[data-resume]').forEach((el) => { el.hidden = false; }); };
  if (/^https?:/i.test(site.resumeUrl)) show();
  else {
    // (The dev server answers any path with the page itself, so check it's really a PDF.)
    fetch(BASE + site.resumeUrl, { method: 'HEAD' })
      .then((r) => { if (r.ok && /pdf/i.test(r.headers.get('content-type') ?? '')) show(); })
      .catch(() => {});
  }
}

// --- Grids: arrow keys / WASD like a game menu ---------------------------------------------
gridNav(q('[data-inv-grid]'), '.slot-item', (el) => el.closest('[data-nav-item]'), () => blip('move'));
gridNav(q('[data-skill-grid]'), '.slot', (el) => el.closest('[data-nav-item]'), () => blip('move'));
// (A skill's flavor is its tooltip: the shared one, installTooltips above.)

// --- Clicks: UI "hit" feedback, and the fire answers ----------------------------------------
const kindled = q('[data-kindled]');
let kindleTimer = null;
function hideKindled() { kindled.hidden = true; kindled.classList.remove('is-preview'); clearTimeout(kindleTimer); }
function showKindled({ hold = false } = {}) {
  clearTimeout(kindleTimer);
  // Re-show restarts the fade even if it's already up.
  kindled.hidden = true;
  void kindled.offsetWidth;
  kindled.hidden = false;
  kindled.classList.toggle('is-preview', hold);
  live.textContent = `${hero.kindled.title}. ${hero.kindled.subtitle}`;
  blip('kindle');
  if (!hold) kindleTimer = setTimeout(hideKindled, Number(hero.kindled.duration) || 2600);
}
if (new URLSearchParams(location.search).has('kindled')) showKindled({ hold: true });
window.addEventListener('keydown', (e) => { if (!kindled.hidden && e.key === 'Escape') hideKindled(); });
kindled.addEventListener('click', hideKindled);

function stoke() {
  if (!fire) return;
  hideKindled();
  const first = fire.stoke();
  blip('stoke');
  if (fire.element === 'lightning') blip('zap');
  else if (fire.element === 'ice') blip('chime');
  discover('stoke');
  const { show } = hero.kindled;
  if (show === 'always' || (show === 'first' && first)) showKindled();
}

document.addEventListener('click', (e) => {
  if (photo.active && photo.wasDrag()) return; // (the end of an orbit, not a click)
  if (e.target.closest('[data-open-gallery]')) discover('gallery');
  fire?.flash(e.clientX, e.clientY);
  // Clicking the fire draws a new weapon and flame — except in the inventory,
  // where the fire holds the inspected project's weapon (there it just stokes).
  if (e.target.closest('[data-stage], [data-stoke]')) {
    // A click on the knight's summon sign (he's away) summons him.
    if (fire && e.target.closest('[data-stage]') && fire.signAt(e.clientX, e.clientY) && summonKnight()) return;
    // A click while a new weapon is being forged skips ahead to its impact.
    if (fire?.forging && !fire.swinging && fire.hurry()) { blip('select'); discover('hurry'); return; }
    // A click on the planted weapon wakes it: it pulls free for a flourish and plunges back.
    if (fire && !fire.forging && !reducedMotion && fire.weaponAt(e.clientX, e.clientY)) {
      blip('pull');
      fire.flourish().then((ok) => { if (ok) blip('stab'); });
      discover('flourish');
      return;
    }
    // A click on the knight greets him: he answers with a gesture (and the fire isn't stoked).
    if (fire && greets()) {
      const index = fire.knightAt(e.clientX, e.clientY);
      if (index >= 0) { greet(index); return; }
    }
    stoke();
    if (route.screen !== 'projects') rollFor(null);
    return;
  }
  // Home links reset the fire even when you're already home.
  if (e.target.closest('a[data-home]') && route.screen === 'home') goHome();
  const hit = e.target.closest('a, button');
  if (!hit) return;
  const fx = hit.closest('.pix-btn, .slot, .slot-item, .title-item, .contact-link, .menu-item, [data-tab]') ?? hit;
  fx.classList.remove('is-hit');
  void fx.offsetWidth;
  fx.classList.add('is-hit');
  setTimeout(() => fx.classList.remove('is-hit'), 200);
  fire?.puff(0.3);
});

// --- The knight who comes to the fire (bonfire/knights.js) ------------------------------------
// He isn't there when the page opens: his summon sign glows on the ground by his seat, and a
// click on it (or the pack's "Summon") calls him. He forms out of it in the current
// element's way (scene.js, bonfire/knightArrival.js), rests a long while (effects.knight's
// rest), then burns away into it again; the pack's "Send Him Off" sends him sooner. The
// admin can have him there from the start instead (effects.knight.arrival 'start').
//
// A click on him while he rests is a greeting: he answers with a gesture, never the same one
// twice running, and Praise the Sun most of all (always the first time). effects.knight.gestures
// turns that off (then a click on him stokes the fire like anywhere else), and so does
// reduced motion, where he sits still. The pack dresses him: his helmet (a new one each
// summons unless the visitor picks one: then that one, remembered in this browser, and
// scene.js starts him in it), his style and his armor's finish (a visitor's pick is
// remembered too, and put on him as the scene loads; the admin's preview shows the draft's
// settings instead), and a gesture on request (the Default Dance too).
//
// Whether he may come at all: effects.knight.show, and his model having loaded (it's its own
// file; without it, or without WebGL, the fire burns alone). fire.knights.presence, followed
// through onPresence, says where he is. The scene's description follows him: his sentence
// while he's by the fire, his sign's while he's away, nothing where he can't come; and the
// discoveries only he gives leave the count where he can't come (knightChanged).
const KNIGHT_HELMET = 'knightHelmet'; // (the store keys)
const KNIGHT_STYLE = 'knightStyle';
const KNIGHT_FINISH = 'knightFinish';
const KNIGHT_FINDS = ['summon', 'knight', 'helm', 'style']; // (the discoveries only he gives)
let lastGreeting = null;
let knightModel = null; // his model loaded (true), didn't (false), or not known yet (null)
const hasKnight = () => knightModel === true && effects.knight.show;
/** Where he is: 'away' (his sign waits), 'arriving', 'resting', 'leaving'. */
const knightPresence = () => fire?.knights.presence ?? 'away';
/** He's by the fire now (not away: forming, resting or leaving). */
const knightHere = () => hasKnight() && knightPresence() !== 'away';
const greets = () => effects.knight.gestures && !reducedMotion && hasKnight() && knightPresence() === 'resting';
function knightChanged() {
  // (Until the scene loads there's no sign drawn yet; there from the start, he's described
  // from the first.)
  const allowed = knightModel === null ? effects.knight.show : hasKnight();
  const here = knightModel === null ? effects.knight.show && effects.knight.arrival === 'start' : knightHere();
  const label = q('#scene-label');
  const text = sceneLabel(here ? true : allowed && knightModel === true ? 'sign' : false);
  if (label && label.textContent !== text) label.textContent = text;
  // Where he can't come, what only he gives leaves the count. 'knight' is a greeting (a click on
  // him, or a gesture from the pack): motion, so never for reduced motion.
  discoveries.setOut(allowed ? (reducedMotion ? ['knight'] : []) : KNIGHT_FINDS);
  drawDiscoveryCount();
  pack.refresh();
}
/** The knight's helmet for the pack: null while he isn't there (hidden, or no model). */
const knightHelmet = () => (fire?.knights.list[0]?.present ? fire.knights.helmet : null);
function greet(index) {
  const name = greeting(lastGreeting);
  if (!fire?.knights.gesture(name, { index })) return;
  lastGreeting = name;
  blip('select');
  discover('knight');
  live.textContent = `The knight answers: ${GESTURE_NAMES[name]}.`;
}
/** Summon him from his sign (a click on it, or the pack): he forms out of it in the current element's way. False if he can't come now. */
function summonKnight() {
  if (!hasKnight() || !fire?.knights.summonKnight()) return false;
  blip('form');
  discover('summon');
  live.textContent = 'The knight answers the summons.';
  return true;
}
/** Send him off (the pack): he burns away into his sign. False if he isn't resting there. */
function dismissKnight() {
  if (knightPresence() !== 'resting' || !fire?.knights.dismissKnight()) return false;
  blip('back');
  live.textContent = 'The knight burns away into his sign.';
  return true;
}
/** The style he's changing into (the pack marks it at once; the change takes ~1.2 s, a style's own model loads first). */
let styleGoal = null;
const knightStyle = () => styleGoal ?? fire?.knights.style ?? null;
/** His style (the pack): he burns away and forms again in it. Remembered for the next visit. False if nothing changes. */
function changeStyle(key, { remember = true } = {}) {
  if (!fire || !Object.hasOwn(STYLE_NAMES, key) || key === knightStyle() || knightPresence() !== 'resting') return false;
  if (remember) store.set(KNIGHT_STYLE, key);
  styleGoal = key;
  const now = fire;
  now.knights.setStyle(key).finally(() => {
    if (styleGoal === key) styleGoal = null;
    if (fire === now) pack.refresh(); // (the finishes are the steel styles')
  });
  if (!reducedMotion) setTimeout(() => blip('form'), 700);
  live.textContent = `The knight is drawn anew: ${STYLE_NAMES[key]}.`;
  return true;
}
/** His armor's finish (the pack): the steel's color changes at once. Remembered for the next visit. False if nothing changes. */
function changeFinish(key, { remember = true } = {}) {
  if (!fire || !Object.hasOwn(FINISH_NAMES, key) || key === fire.knights.finish || knightPresence() !== 'resting') return false;
  if (remember) store.set(KNIGHT_FINISH, key);
  fire.knights.setFinish(key);
  live.textContent = `His armor turns ${FINISH_NAMES[key]}.`;
  return true;
}
/** Put a helmet on him (the pack): the swap takes 1.6 s, and a shimmer as the new one forms. False if nothing changes. */
function changeHelmet(key, { remember = true } = {}) {
  if (!fire || !HELMET_NAMES[key] || key === knightHelmet() || !knightHelmet()) return false;
  if (remember) store.set(KNIGHT_HELMET, key);
  fire.knights.setHelmet(key, { index: 0 });
  if (!reducedMotion) setTimeout(() => blip('form'), 1200);
  live.textContent = `The knight puts on the ${HELMET_NAMES[key]}.`;
  return true;
}

// --- Hover effects: what a click on the scene will do ----------------------------------------
// Over the planted weapon its rim glows (a click wakes it); over the knight's summon sign it
// brightens and its motes rise (a click summons him); over the knight his rim warms and he
// looks up at you (a click greets him: only while it does, greets()); over the fire
// it flares up (a click stokes it, or skips ahead while a new weapon is being forged). The
// effects are in the scene itself (scene.js hoverAt); here the cursor turns to a pointer.
// Mouse and pen only; checked at most ~12 times a second (and once more where the pointer
// comes to rest).
let hoverAt = 0;
let hoverWhat = null;
let hoverInScene = false; // (something in the scene shows its hover, pointer or not)
let hoverTimer = 0;
const stageEl = q('[data-stage]');
function setHover(what) {
  if (what === hoverWhat) return;
  hoverWhat = what;
  stageEl.dataset.hover = what ?? ''; // (styles.css turns the cursor to a pointer over what a click works on)
}
function checkHover(x, y) {
  hoverAt = performance.now();
  // (Not greeting: he's no click target, so no hover of his; the fire behind him is the fire.)
  let what = fire.hoverAt(x, y, { knight: greets() });
  hoverInScene = !!what;
  if (what === 'weapon' && (reducedMotion || fire.forging)) what = 'fire'; // (no flourish then)
  if (fire.forging && !fire.swinging && what && what !== 'sign') what = 'skip';
  setHover(what);
}
function leaveHover() {
  clearTimeout(hoverTimer);
  if (hoverInScene) fire?.hoverOff();
  hoverInScene = false;
  setHover(null);
}
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || !fire) return;
  const onStage = e.target.closest?.('[data-stage]') && !photo.active && !breakdown.active;
  if (!onStage) { if (hoverInScene || hoverWhat) leaveHover(); return; }
  clearTimeout(hoverTimer);
  const wait = 80 - (performance.now() - hoverAt);
  const { clientX: x, clientY: y } = e;
  if (wait > 0) hoverTimer = setTimeout(() => { if (fire) checkHover(x, y); }, wait); // (the last move counts too)
  else checkHover(x, y);
}, { passive: true });
document.documentElement.addEventListener('pointerleave', leaveHover);

// --- The pack (ui/pack.js): fast travel, swap the weapon, cast a spell, or tend the knight --
// Weapons and spells follow what was last asked for (the gem moves as you pick), the place
// (the scenery the Map travels to) what's there now.
const pack = createPack({
  label: ui.pack,
  items: bonfireItems({
    state: () => (fire ? {
      scenery: fire.scenery, weapon: equipment.weapon, element: equipment.element, flame: equipment.flame,
      helmet: knightHelmet(), presence: knightPresence(), style: knightStyle(), finish: fire.knights.finish,
    } : null),
    busy: () => !fire || fire.forging,
    reducedMotion,
    onScene: (key) => {
      if (!fire?.setScenery(key, { flash: true })) return;
      blip('stoke');
      discover('scenery');
      live.textContent = `The fire burns in ${SCENERIES[key]}.`;
    },
    onWeapon: (key) => { if (key !== equipment.weapon) equip(key, equipment.flame, equipment.item); },
    onRing: () => {
      fire?.ring(1.2);
      blip(fire?.element === 'lightning' ? 'zap' : fire?.element === 'ice' ? 'chime' : 'stoke');
      discover('spell');
    },
    onLiving: () => {
      if (!fire || fire.forging) return;
      blip('pull');
      fire.flourish().then((ok) => { if (ok) blip('stab'); });
      discover('flourish');
      discover('spell');
    },
    // A new spell forges a new weapon in that element (the swap takes after it).
    elementTip: 'Also forges a new weapon.',
    onElement: (key) => {
      if (key === equipment.element) return;
      equip(pick(weaponKeys.filter((k) => k !== equipment.weapon)), equipment.flame, equipment.item, { element: key });
      discover('spell');
    },
    // New bonfire colors: the same weapon, relit in them (it lands like a stoke, no forge).
    onFlame: (key) => {
      if (key === equipment.flame) return;
      blip('stoke');
      equip(equipment.weapon, key, equipment.item);
      discover('spell');
    },
    // The knight: summoned while he's away; by the fire, a new helmet, style or finish (kept
    // for your next visit), a gesture on request (a greeting as much as a click on him is: the
    // keyboard's way to one), or sent off. Only where he may come (hasKnight): otherwise the
    // pack leaves the item out.
    onSummon: () => summonKnight(),
    onDismiss: () => dismissKnight(),
    onHelmet: (key) => { if (changeHelmet(key)) discover('helm'); },
    onStyle: (key) => { if (changeStyle(key)) discover('style'); },
    onFinish: (key) => { if (changeFinish(key)) discover('style'); },
    onGesture: (name) => {
      if (!fire?.knights.gesture(name, { index: 0 })) return; // (false: he didn't start it, e.g. mid-swap)
      lastGreeting = name;
      discover('knight');
      live.textContent = `The knight: ${GESTURE_NAMES[name]}.`;
    },
    hasKnight,
  }),
  onSound: (kind) => blip(kind === 'open' ? 'pack' : kind),
  onOpen: () => discover('pack'),
  clearTop: () => header.getBoundingClientRect().bottom, // (the header is over the pack's lists)
});
app.append(pack.el);
knightChanged();

// --- The bonfire --------------------------------------------------------------------------
// Without WebGL there's no scene: the page stays, and the ways into what needs one go
// (photo mode and the breakdown in the rest menu; styles.css hides the rest, like the
// Portfolio's "Take This Page Apart").
function failScene(error) {
  fire?.dispose();
  fire = null;
  delete window.__fire;
  markSceneFailed(null, error, { log: 'Bonfire unavailable; showing the static portfolio.' });
  q('[data-stage]').classList.remove('is-ready');
  hud.close({ quiet: true });
  breakdown.exit();
  photo.exit();
  wantsBreakdown = false;
  for (const b of qa('[data-menu-action="photo"], [data-menu-action="breakdown"], [data-menu-action="render"]')) {
    b.closest('li').hidden = true; // (and so out of the menu's arrow keys)
  }
  knightModel = false;
  knightChanged();
  displayedEquipment = { ...equipment };
  applyFlame(equipment.flame);
  refreshEquipLabels();
}

// Construct the real renderer once instead of probing with a second WebGL context.
let sceneGeneration = 0;
function startScene() {
  const generation = ++sceneGeneration;
  return import('./bonfire/scene.js').then(async ({ createBonfire }) => {
    const stage = q('[data-stage]');
    const candidate = createBonfire(stage, {
      reducedMotion, knightHelmet: store.get(KNIGHT_HELMET), onImpact, onFormed: () => blip('form'), onRamp: setAccentRamp, onError: failScene,
    });
    await candidate.ready;
    if (generation !== sceneGeneration) { candidate.dispose(); return; } // superseded by a newer rebuild
    fire = candidate;
    styleGoal = null; // (a style change under way was the last scene's)
    if (import.meta.env.DEV) window.__fire = fire;
    // (His model comes with the scene's: known now, or at once after.)
    fire.knights.ready.then((ok) => { if (fire === candidate) { knightModel = ok; knightChanged(); } });
    // (He comes and goes: the page follows.)
    fire.knights.onPresence(() => { if (fire === candidate) knightChanged(); });
    // (A visitor's style and finish from an earlier visit; the admin's preview shows the draft's.)
    // (And the cursor's pick from the render settings or ?lab: the setter takes only a real one.)
    if (!previewing) {
      const style = store.get(KNIGHT_STYLE);
      const finish = store.get(KNIGHT_FINISH);
      const cursor = store.get(CURSOR_KEY);
      if (Object.hasOwn(STYLE_NAMES, style)) fire.knights.setStyle(style, { instant: true });
      if (Object.hasOwn(FINISH_NAMES, finish)) fire.knights.setFinish(finish);
      if (cursor) fire.interaction = cursor;
    }
    fire.setView(route.screen === 'projects' && route.item ? 'inspect' : route.screen, { instant: true });
    // Navigation during loading only changes requested state; initialize with its latest value.
    await fire.equip(equipment.weapon, equipment.flame, { instant: true, item: equipment.item, element: equipment.element });
    stage.classList.add('is-ready');
  }).catch(failScene);
}

startScene().then(async () => {
    if (!fire) return;
    if (wantsBreakdown) { wantsBreakdown = false; breakdown.enter(); }

    // Cursor-interaction lab (prototype picker): open the site with ?lab. (Its pick is the
    // render settings' Cursor row's, kept in the same place: startScene put it on.)
    if (new URLSearchParams(location.search).has('lab')) {
      await import('./bonfire/interaction.js').then(({ MODES }) => {
        const lab = document.createElement('aside');
        lab.className = 'lab';
        lab.setAttribute('aria-label', 'Fire interaction prototypes');
        lab.innerHTML = `<p class="lab-title">Cursor → fire <span>prototypes</span></p>
          ${Object.entries(MODES).map(([k, m]) => `
            <label class="lab-option"><input type="radio" name="lab-mode" value="${k}"${fire.interaction === k ? ' checked' : ''}>
              <span><b>${m.name}</b> ${m.blurb}</span></label>`).join('')}
          <p class="lab-note">Move the cursor through the fire. Your pick is remembered in this browser.</p>`;
        lab.addEventListener('change', (e) => {
          fire.interaction = e.target.value;
          store.set(CURSOR_KEY, e.target.value);
        });
        document.body.appendChild(lab);
      });
    }
  });

// --- Admin live preview ------------------------------------------------------------------
// The admin's Look & Feel pages (Colors, Fire & Elements, Picture, Knight) embed this site
// as ?preview and stream their draft in.
// Only the parent frame is listened to, and every payload is validated first; the
// changes live in this page only (nothing is saved from here).
const changedAt = (a, b, path) => JSON.stringify(path.split('.').reduce((o, k) => o?.[k], a)) !== JSON.stringify(path.split('.').reduce((o, k) => o?.[k], b));
let rebuildTimer = 0;
onEffects((next, prev) => {
  if (changedAt(next, prev, 'colors')) { applyCssPalette(); installDitherPatterns(base); }
  for (const eq of [equipment, displayedEquipment]) { eq.flame = flameOr(eq.flame); eq.element = elementOr(eq.element); }
  applyFlame(displayedEquipment.flame);
  refreshEquipLabels();
  if (STRUCTURAL.some((p) => changedAt(next, prev, p))) {
    // Counts size GPU buffers: rebuild the scene once the slider settles.
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      fire?.dispose();
      fire = null;
      q('[data-stage]').classList.remove('is-ready');
      startScene();
    }, 300);
  }
  fire?.applyEffects();
  knightChanged(); // (effects.knight.show)
});

if (previewing) {
  document.documentElement.classList.add('is-preview');
  // (The content rules only load here: they bring the scene format and Bonfire Live's tables
  // with them, which no visitor's first load should carry. Drafts apply in the order sent.)
  const rulesReady = import('./contentRules.js');
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || typeof e.data?.type !== 'string') return;
    const msg = e.data;
    if (msg.type === 'nh:effects') {
      rulesReady.then(({ validateEffects }) => {
        let ok = true;
        validateEffects(msg.effects, () => { ok = false; });
        if (ok) setEffects(msg.effects);
      }, () => { /* the rules didn't load: the draft isn't shown */ });
    } else if (msg.type === 'nh:flame' && Object.hasOwn(flames, msg.id)) {
      // Forge it (a new weapon, the full swap), or just show it: recolor in place.
      if (msg.instant) { if (equipment.flame !== msg.id) equip(equipment.weapon, msg.id, equipment.item, { instant: true }); }
      else equip(pick(weaponKeys.filter((k) => k !== equipment.weapon)), msg.id, equipment.item);
    } else if (msg.type === 'nh:element' && elementOr(msg.id) === msg.id) {
      equip(pick(weaponKeys.filter((k) => k !== equipment.weapon)), equipment.flame, equipment.item, { element: msg.id });
    } else if (msg.type === 'nh:stoke') {
      stoke();
    } else if (msg.type === 'nh:roll') {
      rollFor(equipment.item);
    } else if (msg.type === 'nh:weapon' && Object.hasOwn(weapons, msg.key)) {
      // (Any weapon, even one switched out of the draw: the admin is previewing it.)
      if (msg.key !== equipment.weapon) equip(msg.key, equipment.flame, equipment.item);
    } else if (msg.type === 'nh:flourish') {
      if (fire && !fire.forging) fire.flourish();
    } else if (msg.type === 'nh:helmet' && Object.hasOwn(HELMET_NAMES, msg.key)) {
      changeHelmet(msg.key, { remember: false }); // (the admin is trying it: not this browser's pick)
    } else if (msg.type === 'nh:gesture' && Object.hasOwn(GESTURE_NAMES, msg.name)) {
      fire?.knights.gesture(msg.name, { index: 0 });
    } else if (msg.type === 'nh:knight') {
      // (The admin trying his arrival and leaving, in the fire's current element.)
      if (msg.do === 'summon') summonKnight();
      else if (msg.do === 'dismiss') dismissKnight();
    } else if (msg.type === 'nh:screen' && order.includes(msg.screen)) {
      go(msg.screen === 'home' ? '#/' : `#/${msg.screen}`);
    }
  });
  window.parent.postMessage({ type: 'nh:ready' }, '*');
}

