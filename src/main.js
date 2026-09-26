import './styles.css';
import { applyCssPalette, base, flames, flameOr, rotation } from './palette.js';
import { screens, hero, ui, weapons, startingEquipment, items } from './content.js';
import { onEffects, setEffects } from './effects.js';
import { STRUCTURAL } from './effectsDefaults.js';
import { validateEffects } from './contentRules.js';
import {
  renderChrome, renderHome, renderProjects, renderExperience,
  renderSkills, renderAbout, renderContact,
} from './render.js';
import { installDitherPatterns } from './ui/dither.js';
import { setSound, blip } from './ui/audio.js';
import { gridNav, listNav } from './ui/spatial.js';
import { setupInventory } from './ui/inventory.js';
import { applyFlame, setAccentRamp } from './ui/theme.js';
import { parseRoute, readRoute, routePath, isEditing } from './routes.js';
import { updateMetadata } from './seo.js';
const BASE = import.meta.env.BASE_URL;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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

// --- Equipment (weapon + flame in the fire) -----------------------------------------------
const weaponKeys = Object.keys(weapons);
// Requested state drives future choices; displayed state changes only at impact.
let equipment = { ...startingEquipment, item: null };
let displayedEquipment = { ...equipment };
let fire = null; // set once the 3D scene module loads
const equipLabel = () => `${weapons[displayedEquipment.weapon]} · ${flames[displayedEquipment.flame]?.name ?? ''}`;

// The E badge follows the latest request (it moves on click); the weapon and
// flame labels follow what's actually in the fire (they change at impact).
function refreshEquipLabels() {
  inventory.markEquipped(equipment.item);
  inventory.setWield(equipLabel());
  qa('[data-equip-label]').forEach((el) => { el.textContent = equipLabel(); });
}
refreshEquipLabels();

function equip(weapon, flame, item, { instant = false } = {}) {
  const same = equipment.weapon === weapon && equipment.flame === flame;
  equipment = { weapon, flame, item };
  inventory.markEquipped(item);
  if (!fire) {
    // Scene not loaded yet (or no WebGL): theme now; the scene catches up on load.
    displayedEquipment = { ...equipment };
    if (!same) applyFlame(flame);
    refreshEquipLabels();
    return;
  }
  if (!same && !instant) blip('pull');
  fire.equip(weapon, flame, { instant, item }).catch(failScene);
}

/** Inspecting a project draws a random weapon and flame (never the same as now). */
function rollFor(item) {
  const fresh = rotation().filter((k) => k !== equipment.flame && k !== startingEquipment.flame);
  equip(
    pick(weaponKeys.filter((k) => k !== equipment.weapon && k !== startingEquipment.weapon)),
    pick(fresh.length ? fresh : Object.keys(flames)),
    item,
  );
}

function onImpact(flame, _from, instant, selection) {
  displayedEquipment = { ...selection };
  document.documentElement.dataset.flame = flame;
  if (instant) applyFlame(flame); // otherwise the scene eases the accents via onRamp
  refreshEquipLabels();
  if (!instant) {
    blip('stab');
    live.textContent = `The fire takes the ${weapons[displayedEquipment.weapon]}. ${flames[flame].name}.`;
  }
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
      if (user || prev.item !== next.item) rollFor(next.item);
    }
  }

  // Home puts the base longsword and ember flame back.
  if (next.screen === 'home') equip(startingEquipment.weapon, startingEquipment.flame, null);

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
  if (k === 'q' || k === 'e') {
    const i = order.indexOf(route.screen);
    const nextId = order[(i + (k === 'e' ? 1 : -1) + order.length) % order.length];
    go(nextId === 'home' ? '#/' : `#/${nextId}`);
  } else if (e.key === 'Escape') {
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
  if (e.target.closest('a[data-menu-item]')) menu.close();
});
menu.addEventListener('close', () => blip('back'));
listNav(menu, '[data-menu-item]', { onMove: () => blip('move') });

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
  if (on) blip('select');
}));
if (store.get('sound') === '1') {
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
  const { show } = hero.kindled;
  if (show === 'always' || (show === 'first' && first)) showKindled();
}

document.addEventListener('click', (e) => {
  fire?.flash(e.clientX, e.clientY);
  // Clicking the fire draws a new weapon and flame — except in the inventory,
  // where the fire holds the inspected project's weapon (there it just stokes).
  if (e.target.closest('[data-stage], [data-stoke]')) {
    stoke();
    if (route.screen !== 'projects') rollFor(null);
    return;
  }
  // Home links reset the fire even when you're already home.
  if (e.target.closest('a[data-home]') && route.screen === 'home') {
    equip(startingEquipment.weapon, startingEquipment.flame, null);
  }
  const hit = e.target.closest('a, button');
  if (!hit) return;
  const fx = hit.closest('.pix-btn, .slot, .slot-item, .title-item, .contact-link, .menu-item, [data-tab]') ?? hit;
  fx.classList.remove('is-hit');
  void fx.offsetWidth;
  fx.classList.add('is-hit');
  setTimeout(() => fx.classList.remove('is-hit'), 200);
  fire?.puff(0.3);
});

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
    const candidate = createBonfire(stage, { reducedMotion, onImpact, onRamp: setAccentRamp, onError: failScene });
    await candidate.ready;
    if (generation !== sceneGeneration) { candidate.dispose(); return; } // superseded by a newer rebuild
    fire = candidate;
    if (import.meta.env.DEV) window.__fire = fire;
    fire.setView(route.screen === 'projects' && route.item ? 'inspect' : route.screen, { instant: true });
    // Navigation during loading only changes requested state; initialize with its latest value.
    await fire.equip(equipment.weapon, equipment.flame, { instant: true, item: equipment.item });
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
  for (const eq of [equipment, displayedEquipment]) eq.flame = flameOr(eq.flame);
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
      equip(pick(weaponKeys.filter((k) => k !== equipment.weapon)), msg.id, equipment.item);
    } else if (msg.type === 'nh:stoke') {
      stoke();
    } else if (msg.type === 'nh:roll') {
      rollFor(equipment.item);
    } else if (msg.type === 'nh:screen' && order.includes(msg.screen)) {
      go(msg.screen === 'home' ? '#/' : `#/${msg.screen}`);
    }
  });
  window.parent.postMessage({ type: 'nh:ready' }, '*');
}

