import './styles.css';
import { applyCssPalette, base, flames, flameOr, rotation } from './palette.js';
import { screens, hero, ui, weapons, startingEquipment, items, drawnWeapons } from './content.js';
import { onEffects, setEffects } from './effects.js';
import { drawElement, elementOr, flameTitle } from './elements.js';
import { STRUCTURAL } from './effectsDefaults.js';
import { validateEffects } from './contentRules.js';
import {
  renderChrome, renderHome, renderProjects, renderExperience,
  renderSkills, renderAbout, renderContact,
} from './render.js';
import { installDitherPatterns } from './ui/dither.js';
import { setSound, blip, forgeHum } from './ui/audio.js';
import { gridNav, listNav } from './ui/spatial.js';
import { setupInventory } from './ui/inventory.js';
import { createDiscoveries } from './ui/discoveries.js';
import { createPhotoMode } from './ui/photo.js';
import { createBreakdown } from './ui/breakdown.js';
import { createPack, bonfireItems } from './ui/pack.js';
import { SCENERIES } from './sceneries.js';
import { applyFlame, setAccentRamp } from './ui/theme.js';
import { parseRoute, readRoute, routePath, isEditing } from './routes.js';
import { updateMetadata } from './seo.js';
import { pick } from './math.js';
import { esc } from './html.js';
const BASE = import.meta.env.BASE_URL;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

document.documentElement.classList.add('js');
if (touch) document.documentElement.classList.add('touch');
applyCssPalette();
applyFlame(startingEquipment.flame);
installDitherPatterns(base);

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
  q('[data-discoveries-close]', discoveriesDialog).focus();
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

// --- Photo mode and "How it's made" (ui/photo.js, ui/breakdown.js). Created before the
// page's own keys, so their Esc closes them without also going back a screen.
const photo = createPhotoMode({
  getFire: () => fire,
  onExit: () => fire?.setView(route.screen === 'projects' && route.item ? 'inspect' : route.screen),
  onColors: () => { const fresh = rotation().filter((k) => k !== equipment.flame); equip(equipment.weapon, pick(fresh), equipment.item, { instant: true }); },
  onElement: () => {
    const next = ['fire', 'lightning', 'ice'][(['fire', 'lightning', 'ice'].indexOf(equipment.element) + 1) % 3];
    equip(pick(weaponKeys.filter((k) => k !== equipment.weapon)), equipment.flame, equipment.item, { element: next });
  },
  onEnter: () => { breakdown.exit(); discover('photo'); },
});
const breakdown = createBreakdown({ getFire: () => fire, onEnter: () => { photo.exit(); discover('breakdown'); } });

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

function render(next, user) {
  const prev = route;
  route = next;
  const changedScreen = prev.screen !== next.screen;

  // Screen visibility + entrance.
  for (const [id, el] of Object.entries(screenEls)) el.hidden = id !== next.screen;
  const el = screenEls[next.screen];
  if (changedScreen) {
    el.classList.remove('is-entering');
    void el.offsetWidth;
    el.classList.add('is-entering');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  document.body.dataset.screen = next.screen;
  qa('[data-tab]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === next.screen));
  qa('[data-tab][aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));

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
  const next = parseHash();
  history.replaceState(null, '', routePath(next, BASE) + location.search);
  render(next, user);
}
window.addEventListener('popstate', () => syncRoute());
window.addEventListener('hashchange', () => syncRoute());
document.addEventListener('click', (event) => {
  const a = event.target.closest('a');
  if (!a || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || a.target || a.hasAttribute('download')) return;
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

// --- Keyboard: Q/E switch screens, Esc goes back ------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || isEditing(e.target) || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === 'f') { photo.toggle(); return; }
  if (k === 'b') { breakdown.toggle(); return; }
  if (photo.active || breakdown.active) return;
  if (k === 'i') { pack.toggle(); return; }
  if (k === 'q' || k === 'e') step(k === 'e' ? 1 : -1);
  else if (e.key === 'Escape') {
    if (!q('[data-kindled]').hidden) return;
    if (route.screen === 'projects' && route.item) go('#/projects');
    else if (route.screen !== 'home') go('#/');
  }
});

// --- Header, rest menu, sound ---------------------------------------------------------------
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

listNav(q('.tabs'), 'a', { horizontal: true, onMove: () => blip('move') });
listNav(q('[data-title-menu]'), '[data-title-item]', { onMove: () => blip('move') });

const menu = q('[data-menu]');
q('[data-menu-open]').addEventListener('click', () => {
  menu.showModal();
  q('[data-menu-item]', menu).focus();
  blip('select');
});
menu.addEventListener('click', (e) => {
  if (e.target === menu || e.target.closest('[data-menu-close]')) return menu.close();
  const action = e.target.closest('[data-menu-action]')?.dataset.menuAction;
  if (action) {
    menu.close();
    if (action === 'photo') photo.enter();
    else if (action === 'breakdown') breakdown.enter();
    else if (action === 'discoveries') openDiscoveries();
    return;
  }
  if (e.target.closest('a[data-menu-item]')) menu.close();
});
menu.addEventListener('close', () => blip('back'));
listNav(menu, '[data-menu-item]', { onMove: () => blip('move') });

// The Q / E keys are buttons too (the same step through the screens).
function step(dir) {
  const i = order.indexOf(route.screen);
  const nextId = order[(i + dir + order.length) % order.length];
  go(nextId === 'home' ? '#/' : `#/${nextId}`);
}
qa('[data-step]').forEach((b) => b.addEventListener('click', () => { step(Number(b.dataset.step)); blip('select'); }));

// Sound: the label says what it is now ("Sound: off"), the tooltip what a click does.
const soundButtons = qa('[data-sound]');
function applySound(on) {
  on = setSound(on);
  soundButtons.forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    b.title = ui.soundHint ?? '';
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
    b.title = ui.soundHint ?? '';
    q('[data-sound-label]', b).textContent = ui.soundOn;
  });
  const resume = () => { applySound(true); window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}

// --- Grids: arrow keys / WASD like a game menu ---------------------------------------------
gridNav(q('[data-inv-grid]'), '.slot-item', (el) => el.closest('[data-nav-item]'), () => blip('move'));
gridNav(q('[data-skill-grid]'), '.slot', (el) => el.closest('[data-nav-item]'), () => blip('move'));

// Skill tooltips.
const tooltip = q('[data-tooltip]');
function showTip(slot) {
  q('.tooltip-name', tooltip).textContent = slot.dataset.skill;
  q('.tooltip-flavor', tooltip).textContent = slot.dataset.flavor;
  tooltip.hidden = false;
  const r = slot.getBoundingClientRect();
  const t = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  const top = r.top - t.height - 10 < 8 ? r.bottom + 10 : r.top - t.height - 10;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}
const hideTip = () => { tooltip.hidden = true; };
qa('.slot').forEach((s) => {
  s.addEventListener('mouseenter', () => showTip(s));
  s.addEventListener('mouseleave', () => { if (document.activeElement !== s) hideTip(); });
  s.addEventListener('focus', () => showTip(s));
  s.addEventListener('blur', hideTip);
});
window.addEventListener('scroll', hideTip, { passive: true });

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
    // A click while a new weapon is being forged skips ahead to its impact.
    if (fire?.forging && !fire.swinging && fire.hurry()) { blip('select'); discover('hurry'); return; }
    // A click on the planted weapon wakes it: it pulls free for a flourish and plunges back.
    if (fire && !fire.forging && !reducedMotion && fire.weaponAt(e.clientX, e.clientY)) {
      blip('pull');
      fire.flourish().then((ok) => { if (ok) blip('stab'); });
      discover('flourish');
      return;
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

// --- Hover effects: what a click on the scene will do ----------------------------------------
// Over the planted weapon its rim glows (a click wakes it); over the fire it flares up (a
// click stokes it, or skips ahead while a new weapon is being forged). The effects are in
// the scene itself (scene.js hoverAt); here the cursor turns to a pointer. Mouse and pen
// only; checked at most ~12 times a second.
let hoverAt = 0;
let hoverWhat = null;
const stageEl = q('[data-stage]');
function setHover(what) {
  if (what === hoverWhat) return;
  hoverWhat = what;
  stageEl.dataset.hover = what ?? '';
}
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || !fire) return;
  const onStage = e.target.closest?.('[data-stage]') && !photo.active && !breakdown.active;
  if (!onStage) { if (hoverWhat) { fire.hoverOff(); setHover(null); } return; }
  const now = performance.now();
  if (now - hoverAt < 80) return;
  hoverAt = now;
  let what = fire.hoverAt(e.clientX, e.clientY);
  if (what === 'weapon' && (reducedMotion || fire.forging)) what = 'fire'; // (no flourish then)
  if (fire.forging && !fire.swinging && what) what = 'skip';
  setHover(what);
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { fire?.hoverOff(); setHover(null); });

// --- The pack (ui/pack.js): swap the scene or the weapon, or cast a spell -------------------
// Weapons and spells follow what was last asked for (the gem moves as you pick), the scene
// what's there now.
const pack = createPack({
  label: ui.pack,
  items: bonfireItems({
    state: () => (fire ? { scenery: fire.scenery, weapon: equipment.weapon, element: equipment.element } : null),
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
    onElement: (key) => {
      if (key === equipment.element) return;
      equip(pick(weaponKeys.filter((k) => k !== equipment.weapon)), equipment.flame, equipment.item, { element: key });
      discover('spell');
    },
  }),
  onSound: (kind) => blip(kind === 'open' ? 'pack' : kind),
  onOpen: () => discover('pack'),
});
app.append(pack.el);

// --- The bonfire --------------------------------------------------------------------------
function failScene(error) {
  fire?.dispose();
  fire = null;
  delete window.__fire;
  document.documentElement.classList.add('no-webgl');
  q('[data-stage]').classList.remove('is-ready');
  q('[data-debug]').hidden = true;
  displayedEquipment = { ...equipment };
  applyFlame(equipment.flame);
  refreshEquipLabels();
  console.warn('Bonfire unavailable; showing the static portfolio.', error);
}

// Construct the real renderer once instead of probing with a second WebGL context.
let sceneGeneration = 0;
function startScene() {
  const generation = ++sceneGeneration;
  return import('./bonfire/scene.js').then(async ({ createBonfire }) => {
    const stage = q('[data-stage]');
    const candidate = createBonfire(stage, { reducedMotion, onImpact, onFormed: () => blip('form'), onRamp: setAccentRamp, onError: failScene });
    await candidate.ready;
    if (generation !== sceneGeneration) { candidate.dispose(); return; } // superseded by a newer rebuild
    fire = candidate;
    if (import.meta.env.DEV) window.__fire = fire;
    fire.setView(route.screen === 'projects' && route.item ? 'inspect' : route.screen, { instant: true });
    // Navigation during loading only changes requested state; initialize with its latest value.
    await fire.equip(equipment.weapon, equipment.flame, { instant: true, item: equipment.item, element: equipment.element });
    stage.classList.add('is-ready');
  }).catch(failScene);
}

startScene().then(async () => {
    if (!fire) return;
    // Render debug HUD: P toggles, 1–5 cycle settings.
    const hud = q('[data-debug]');
    const drawHud = (dsc) => {
      hud.innerHTML = `<b>RENDER DEBUG</b> (P to close)<br>[1] pixel ${dsc.pixel}<br>[2] palette ${dsc.palette}<br>[3] dither ${dsc.dither}<br>[4] matrix ${dsc.matrix}<br>[5] outlines ${dsc.outlines}<br>[6] cursor ${dsc.interaction}`;
    };
    const keys = { 1: 'pixel', 2: 'palette', 3: 'dither', 4: 'matrix', 5: 'outlines', 6: 'interaction' };

    // Cursor-interaction lab (prototype picker): open the site with ?lab.
    if (new URLSearchParams(location.search).has('lab')) {
      const saved = store.get('fireInteraction');
      if (saved) fire.interaction = saved;
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
          store.set('fireInteraction', e.target.value);
        });
        document.body.appendChild(lab);
      });
    }
    window.addEventListener('keydown', (e) => {
      if (!fire) return;
      if (e.altKey || e.ctrlKey || e.metaKey || isEditing(e.target) || document.querySelector('dialog[open]')) return;
      if (e.key === 'p' || e.key === 'P') { hud.hidden = !hud.hidden; drawHud(fire.describe()); }
      else if (!hud.hidden && keys[e.key]) drawHud(fire.cycle(keys[e.key]));
    });
  });

// --- Admin live preview ------------------------------------------------------------------
// The admin's Effects page embeds this site as ?preview and streams its draft in.
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
});

if (new URLSearchParams(location.search).has('preview') && window.parent !== window) {
  document.documentElement.classList.add('is-preview');
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || typeof e.data?.type !== 'string') return;
    const msg = e.data;
    if (msg.type === 'nh:effects') {
      let ok = true;
      validateEffects(msg.effects, () => { ok = false; });
      if (ok) setEffects(msg.effects);
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
    } else if (msg.type === 'nh:screen' && order.includes(msg.screen)) {
      go(msg.screen === 'home' ? '#/' : `#/${msg.screen}`);
    }
  });
  window.parent.postMessage({ type: 'nh:ready' }, '*');
}

