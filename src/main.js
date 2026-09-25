import './styles.css';
import { applyCssPalette, base, flames } from './palette.js';
import { screens, hero, ui, weapons, startingEquipment, items } from './content.js';
import {
  renderChrome, renderHome, renderProjects, renderExperience,
  renderSkills, renderAbout, renderContact,
} from './render.js';
import { installDitherPatterns } from './ui/dither.js';
import { setSound, blip } from './ui/audio.js';
import { gridNav, listNav } from './ui/spatial.js';
import { setupInventory } from './ui/inventory.js';
import { applyFlame, setAccentRamp } from './ui/theme.js';

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
const flameKeys = Object.keys(flames);
let equipment = { ...startingEquipment, item: null };
let fire = null; // set once the 3D scene module loads
const equipLabel = () => `${weapons[equipment.weapon]} · ${flames[equipment.flame].name}`;

function refreshEquipLabels() {
  inventory.markEquipped(equipment.item, equipLabel());
  qa('[data-equip-label]').forEach((el) => { el.textContent = equipLabel(); });
}
refreshEquipLabels();

function equip(weapon, flame, item, { instant = false } = {}) {
  if (equipment.weapon === weapon && equipment.flame === flame) {
    equipment.item = item;
    refreshEquipLabels();
    return;
  }
  equipment = { weapon, flame, item };
  if (!fire) {
    // Scene not loaded yet (or no WebGL): theme now; the scene catches up on load.
    applyFlame(flame);
    refreshEquipLabels();
    return;
  }
  if (!instant) blip('pull');
  fire.equip(weapon, flame, { instant });
}

/** Inspecting a project draws a random weapon and flame (never the same as now). */
function rollFor(item) {
  equip(
    pick(weaponKeys.filter((k) => k !== equipment.weapon && k !== startingEquipment.weapon)),
    pick(flameKeys.filter((k) => k !== equipment.flame && k !== startingEquipment.flame)),
    item,
  );
}

function onImpact(flame, from, instant) {
  document.documentElement.dataset.flame = flame;
  if (instant) applyFlame(flame); // otherwise the scene eases the accents via onRamp
  refreshEquipLabels();
  if (!instant) {
    blip('stab');
    live.textContent = `The fire takes the ${weapons[equipment.weapon]}. ${flames[flame].name}.`;
  }
}

// --- Router --------------------------------------------------------------------------------
const order = screens.map((s) => s.id);
let route = { screen: null, item: null };

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [screen = '', item = null] = h.split('/');
  if (!screen) return { screen: 'home', item: null };
  if (!screenEls[screen]) return { screen: 'home', item: null };
  if (screen === 'projects' && item && !inventory.has(item)) return { screen, item: null };
  return { screen, item: screen === 'projects' ? item : null };
}

function go(hash) {
  if (location.hash === hash || (hash === '#/' && !location.hash)) render(parseHash(), true);
  else location.hash = hash;
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
  document.title = next.screen === 'home' ? 'Newton Hoang — Full-stack developer & game maker'
    : `${itemName ?? meta.label} — Newton Hoang`;
  if (user && prev.screen) {
    live.textContent = itemName ? `${itemName}, item details` : `${meta.label}`;
    let target = next.item ? q('#detail-title') : q(`#${next.screen === 'home' ? 'home' : next.screen}-title`);
    if (next.screen === 'projects' && !next.item && prev.item) target = inventory.slotFor(prev.item) ?? target;
    target?.focus({ preventScroll: true });
  }
}

window.addEventListener('hashchange', () => { render(parseHash(), true); blip('select'); });
// Old in-page anchors (#projects) still work.
if (/^#[a-z]+$/.test(location.hash) && screenEls[location.hash.slice(1)]) {
  history.replaceState(null, '', `#/${location.hash.slice(1)}`);
}
render(parseHash(), false);

// --- Keyboard: Q/E switch screens, Esc goes back ------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
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
  setSound(on);
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
function hideKindled() { kindled.hidden = true; clearTimeout(kindleTimer); }
function showKindled() {
  kindled.hidden = false;
  live.textContent = `${hero.kindled.title}. ${hero.kindled.subtitle}`;
  blip('kindle');
  kindleTimer = setTimeout(hideKindled, 2600);
}
window.addEventListener('keydown', (e) => { if (!kindled.hidden && e.key === 'Escape') hideKindled(); });
kindled.addEventListener('click', hideKindled);

function stoke() {
  if (!fire) return;
  hideKindled();
  const first = fire.stoke();
  blip('stoke');
  if (first) showKindled();
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
  if (e.target.closest('a[href="#/"]') && route.screen === 'home') {
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
function webglAvailable() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

if (webglAvailable()) {
  import('./bonfire/scene.js').then(({ createBonfire }) => {
    const stage = q('[data-stage]');
    fire = createBonfire(stage, { reducedMotion, onImpact, onRamp: setAccentRamp });
    if (import.meta.env.DEV) window.__fire = fire; // for local debugging
    fire.setView(route.screen === 'projects' && route.item ? 'inspect' : route.screen, { instant: true });
    fire.ready.then(() => {
      stage.classList.add('is-ready');
      // Deep link straight to an item: equip its roll without the animation.
      if (equipment.weapon !== startingEquipment.weapon || equipment.flame !== startingEquipment.flame) {
        fire.equip(equipment.weapon, equipment.flame, { instant: true });
      }
    });

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
      import('./bonfire/interaction.js').then(({ MODES }) => {
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
      if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
      if (e.key === 'p' || e.key === 'P') { hud.hidden = !hud.hidden; drawHud(fire.describe()); }
      else if (!hud.hidden && keys[e.key]) drawHud(fire.cycle(keys[e.key]));
    });
  });
} else {
  document.documentElement.classList.add('no-webgl');
}
