// The pack: a backpack in the bottom-right corner, the same on the site and in Bonfire Live.
// Hover it (or tap it, or press I) and it opens: its items rise out of it, one slot each.
// Hovering an item (or tapping it, or Enter on it) shows what it can do as a text list
// beside it, like a game's item menu:
//
//   Map         Fast Travel: another place around the fire (the scenery)
//   Anvil       the living weapon, then the weapons by kind: Swords, Greatswords,
//               Polearms, Axes & Hammers (src/weaponGroups.js)
//   Spell Tome  the element's ring, then Elements (a new spell) and Flame Colors
//   Knight      the knight: on the site, "Summon" while he's away (his sign waits on the
//               ground); while he's by the fire "Send Him Off", then a gesture for him to
//               make (the Default Dance too), his helmet (great helm, armet, bascinet),
//               his style and his armor's finish (only where the page has a knight:
//               onHelmet, and where he may come: hasKnight). Its helm icon's eye slit goes
//               dark while he's away (the item's `state`)
//
// The page hands each item its options (what's current, what's unavailable right now)
// and what picking one does, and can leave an item out while it has nothing to offer
// (`available`: the site's Knight item while there's no knight), and can mark an item's
// state on it for its icon to show (`state`, as data-state). A heading starts a group (a
// labelled list: screen readers hear its name), with a `note` under it when the group is
// off for a reason (the finishes of a style that wears its own colors); an option's `tip`
// is its tooltip (ui/tooltip.js: what it does, or why it's off). Keys: arrows move
// (up/down through the items, left into an item's list and right back out), Enter picks,
// Esc closes. A pick (or the page's refresh) redraws the list and keeps the keyboard in it:
// on the same option, or when that one's gone or unavailable now (Summon once he's coming),
// the first one left, or the item itself.
//
// A list always stays on screen, whatever the window and wherever the pack sits (in the
// breakdown it steps aside, over the panel's sheet on phones): too wide for the room left
// of its item, a two-column list goes to one column, then narrows; too tall, it slides
// down (as far as the window's bottom), then scrolls. `clearTop` keeps them below a page's
// header (fitList).
import { esc, corners } from '../html.js';
import { icon } from './pixelArt.js';
import { weapons, ui } from '../content.js';
import { elements, flameTitle } from '../elements.js';
import { flames, rotation } from '../palette.js';
import { ELEMENT_IDS } from '../effectsDefaults.js';
import { SCENERIES } from '../sceneries.js';
import { HELMET_NAMES, GESTURE_NAMES, STYLE_NAMES, FINISH_NAMES } from '../knightNames.js';
import { STYLES } from '../bonfire/knightStyles.js';
import { WEAPON_GROUPS } from '../weaponGroups.js';

export { HELMET_NAMES, GESTURE_NAMES, STYLE_NAMES, FINISH_NAMES };

const CLOSE_DELAY = 320; // ms the pack stays open after the pointer leaves it
const EDGE = 8;         // px a list keeps from the window's edges
const LONG = 12;        // options (headings aside) past which a list goes in two columns

/**
 * @typedef {{ id?: string, label: string, current?: boolean, disabled?: boolean, heading?: boolean,
 *   swatch?: string, tip?: string, note?: string }} PackOption
 *   an option, or (`heading`) the start of a group, with a `note` under it saying why its
 *   options are off; `tip` an option's tooltip
 */

/**
 * Whether a list is long enough for two columns (the weapons, the spells, the knight's):
 * its options counted, not its headings.
 * @param {PackOption[]} options
 */
export const isLong = (options) => options.filter((o) => !o.heading).length > LONG;

/**
 * A list's options in groups: the ones before any heading (the item's actions), then one
 * group per heading.
 * @param {PackOption[]} options
 * @returns {{ heading: PackOption | null, options: PackOption[] }[]}
 */
export function packGroups(options) {
  const groups = [];
  for (const o of options) {
    if (o.heading) groups.push({ heading: o, options: [] });
    else if (groups.length) groups.at(-1).options.push(o);
    else groups.push({ heading: null, options: [o] });
  }
  return groups;
}

/**
 * A list's markup (pure: the tests read it). Each heading's group is a labelled group (and
 * described by its note), holding a list of its options; `id` is the item's, for the
 * headings' ids. All text escaped.
 * @param {string} id
 * @param {PackOption[]} options
 */
export function optionsHtml(id, options) {
  const option = (o) => `<li><button class="pack-option${o.current ? ' is-current' : ''}" type="button" data-pack-option="${esc(o.id)}"
            aria-pressed="${o.current ? 'true' : 'false'}"${o.disabled ? ' disabled' : ''}${o.tip ? ` data-tip="${esc(o.tip)}"` : ''}>
            <span class="cursor" aria-hidden="true"></span>${o.swatch ? `<span class="pack-swatch" style="--sw: ${esc(o.swatch)}" aria-hidden="true"></span>` : ''}<span class="pack-option-label">${esc(o.label)}</span>${o.current ? '<span class="gem" aria-hidden="true"></span>' : ''}
          </button></li>`;
  return packGroups(options).map((g, i) => {
    const list = `<ul class="pack-group-list" role="list">${g.options.map(option).join('')}</ul>`;
    if (!g.heading) return list;
    const hid = `pack-${id}-g${i}`;
    const note = g.heading.note ? `<p class="pack-why" id="${esc(hid)}-why">${esc(g.heading.note)}</p>` : '';
    return `<div class="pack-group" role="group" aria-labelledby="${esc(hid)}"${note ? ` aria-describedby="${esc(hid)}-why"` : ''}>
          <p class="pack-heading" id="${esc(hid)}">${esc(g.heading.label)}</p>${note}${list}
        </div>`;
  }).join('');
}

/**
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Box
 */

/**
 * How to fit a list into the room it has: the list as CSS lays it out (left of its item,
 * its bottom by the item's), and the window's usable box. Too wide: `maxWidth` (it keeps
 * its right edge, by the item). Too tall for the whole window: `maxHeight` (it scrolls).
 * Then `shift` moves it down (+) or up (−) until all of it is inside.
 * @param {Box} box
 * @param {Box} room
 * @returns {{ maxWidth: number | null, maxHeight: number | null, shift: number }}
 */
export function fitList(box, room) {
  const maxWidth = box.left < room.left ? Math.max(0, Math.floor(box.right - room.left)) : null;
  const tall = room.bottom - room.top;
  const height = box.bottom - box.top;
  const maxHeight = height > tall ? Math.max(0, Math.floor(tall)) : null;
  const h = Math.min(height, tall);
  const bottom = Math.min(Math.max(box.bottom, room.top + h), room.bottom);
  return { maxWidth, maxHeight, shift: Math.round(bottom - box.bottom) };
}

/**
 * @param {object} o
 * @param {Array<{ id: string, name: string, verb: string, icon: string,
 *   options: () => PackOption[],
 *   pick: (id: string) => void, available?: () => boolean, state?: () => string | null }>} o.items
 *   `available`: false leaves the item out of the pack for now (checked as it opens and on refresh());
 *   `state`: set on the item as data-state (its icon's look: the knight's item while he's away)
 * @param {string} [o.label]     the pack's own name (the button's label)
 * @param {string} [o.keyHint]   the key that opens it, shown on the button
 * @param {(kind: 'open' | 'move' | 'select' | 'back') => void} [o.onSound]
 * @param {() => void} [o.onOpen]  it opened (the site counts it as a discovery)
 * @param {() => number} [o.clearTop]  px at the top of the window the lists keep clear of (a
 *   header over them)
 */
export function createPack({ items, label = 'Pack', keyHint = 'I', onSound = () => {}, onOpen = () => {}, clearTop = () => 0 }) {
  const el = document.createElement('div');
  el.className = 'pack';
  el.dataset.pack = '';
  el.innerHTML = `
    <ul class="pack-items" role="list" id="pack-items" hidden>
      ${items.map((it, i) => `
        <li class="pack-item" data-pack-item="${esc(it.id)}" style="--i: ${items.length - 1 - i}">
          <button class="pack-slot" type="button" aria-expanded="false" aria-controls="pack-list-${esc(it.id)}"
                  data-pack-slot="${esc(it.id)}" aria-label="${esc(`${it.name}: ${it.verb}`)}">
            ${icon(it.icon, `px-${esc(it.icon)}`)}
          </button>
          <div class="pack-list frame" id="pack-list-${esc(it.id)}" data-pack-list="${esc(it.id)}" hidden>
            ${corners}
            <p class="pack-list-title">${esc(it.name)}<span>${esc(it.verb)}</span></p>
            <div class="pack-options" data-pack-options></div>
          </div>
        </li>`).join('')}
    </ul>
    <button class="pack-toggle" type="button" aria-expanded="false" aria-controls="pack-items" data-pack-toggle
            aria-keyshortcuts="${esc(keyHint)}" data-tip="${esc(label)} (${esc(keyHint)})" data-tip-side="left">
      ${icon('backpack', 'px-backpack')}
      <span class="visually-hidden">${esc(label)}</span>
      <kbd aria-hidden="true">${esc(keyHint)}</kbd>
    </button>`;

  const toggleBtn = el.querySelector('[data-pack-toggle]');
  const list = el.querySelector('.pack-items');
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const itemOf = (id) => el.querySelector(`[data-pack-item="${id}"]`);
  const slotOf = (id) => el.querySelector(`[data-pack-slot="${id}"]`);
  const listOf = (id) => el.querySelector(`[data-pack-list="${id}"]`);
  /** The slots in the pack now (an item that isn't available is left out). */
  const slots = () => [...el.querySelectorAll('.pack-item:not([hidden]) [data-pack-slot]')];
  let isOpen = false;
  let pinned = false; // opened by a click or a key (or a pick in it): it stays open until closed the same way
  let shown = null;   // the item whose list is showing
  let closeTimer = 0;

  /** Leave out the items with nothing to offer now (and close one's list if it was showing). */
  function sortItems() {
    for (const it of items) {
      const off = it.available ? !it.available() : false;
      itemOf(it.id).hidden = off;
      if (off && shown === it.id) hideList();
      if (it.state) itemOf(it.id).dataset.state = it.state() ?? '';
    }
  }

  function drawOptions(id) {
    const options = byId[id].options();
    listOf(id).classList.toggle('is-long', isLong(options));
    listOf(id).querySelector('[data-pack-options]').innerHTML = optionsHtml(id, options);
    fit(listOf(id));
  }

  /**
   * Redraw the list that's showing, keeping the keyboard where it was: on the same option,
   * or (gone, or unavailable now: Summon once he's coming, Send Him Off once he's going) the
   * list's first live one, or its item's slot. Only when `keep` (the keyboard was there: a
   * redraw under a focused option drops focus on the page, where the next Esc would leave
   * the screen instead of closing the pack).
   * @param {string | null} id  the option that had focus
   * @param {boolean} keep
   */
  function redraw(id, keep) {
    if (!shown) return;
    drawOptions(shown);
    if (!keep) return;
    const l = listOf(shown);
    const target = (id ? l.querySelector(`[data-pack-option="${CSS.escape(id)}"]:not(:disabled)`) : null)
      ?? l.querySelector('.pack-option:not(:disabled)') ?? slotOf(shown);
    /** @type {HTMLElement | null} */ (target)?.focus({ preventScroll: true });
  }
  /**
   * The option in the showing list that has focus (its id), or null.
   * @returns {string | null}
   */
  const focusedOption = () => {
    const a = document.activeElement;
    if (!shown || !(a instanceof HTMLElement) || a.dataset.packOption === undefined) return null;
    return listOf(shown).contains(a) ? a.dataset.packOption : null;
  };

  /**
   * Where CSS puts the list, in window px. From the layout offsets, which ignore transforms:
   * the items rise into place with one and the list slides in with another, and either can
   * still be under way when it's measured.
   * @param {HTMLElement} l
   * @returns {Box}
   */
  function layoutBox(l) {
    let x = 0;
    let y = 0;
    for (let n = l; n && n !== el; n = /** @type {HTMLElement} */ (n.offsetParent)) { x += n.offsetLeft; y += n.offsetTop; }
    const p = el.getBoundingClientRect();
    return { left: p.left + x, top: p.top + y, right: p.left + x + l.offsetWidth, bottom: p.top + y + l.offsetHeight };
  }
  /** Keep a showing list inside the window (fitList). */
  function fit(l) {
    if (!l || l.hidden) return;
    l.classList.remove('is-narrow');
    l.style.removeProperty('max-width');
    l.style.removeProperty('min-width');
    l.style.removeProperty('max-height');
    l.style.removeProperty('bottom');
    const doc = document.documentElement;
    const room = { left: EDGE, top: Math.max(0, clearTop()) + EDGE, right: doc.clientWidth - EDGE, bottom: doc.clientHeight - EDGE };
    // Too wide for two columns: one.
    if (l.classList.contains('is-long') && layoutBox(l).left < room.left) l.classList.add('is-narrow');
    const bottom = parseFloat(getComputedStyle(l).bottom) || 0;
    // (Twice: a narrower list can wrap a label and grow taller.)
    for (let pass = 0; pass < 2; pass++) {
      const { maxWidth, maxHeight, shift } = fitList(layoutBox(l), room);
      if (maxWidth !== null) { l.style.maxWidth = `${maxWidth}px`; l.style.minWidth = '0px'; }
      if (maxHeight !== null) l.style.maxHeight = `${maxHeight}px`;
      if (shift) l.style.bottom = `${parseFloat(l.style.bottom || String(bottom)) - shift}px`;
      if (maxWidth === null && maxHeight === null && !shift) break;
    }
  }
  const refit = () => { if (shown) fit(listOf(shown)); };
  window.addEventListener('resize', refit);
  // (The pack glides to a new corner when the page steps aside for the breakdown.)
  el.addEventListener('transitionend', (e) => { if (e.target === el) refit(); });

  function showList(id, { focus = false } = {}) {
    if (shown && shown !== id) hideList();
    if (!id) return;
    shown = id;
    const l = listOf(id);
    l.hidden = false;
    drawOptions(id); // (and fits it, now that it's laid out)
    l.classList.remove('is-in');
    void l.offsetWidth; // (restart the entrance)
    l.classList.add('is-in');
    slotOf(id).setAttribute('aria-expanded', 'true');
    itemOf(id).classList.add('is-shown');
    if (focus) l.querySelector('.pack-option:not(:disabled)')?.focus();
  }
  function hideList() {
    if (!shown) return;
    listOf(shown).hidden = true;
    slotOf(shown).setAttribute('aria-expanded', 'false');
    itemOf(shown).classList.remove('is-shown');
    shown = null;
  }

  function open({ pin = false, focus = false } = {}) {
    clearTimeout(closeTimer);
    pinned = pinned || pin;
    if (!isOpen) {
      isOpen = true;
      sortItems();
      list.hidden = false;
      el.classList.add('is-open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      onSound('open');
      onOpen();
    }
    if (focus) slots()[0]?.focus();
  }
  function close({ focus = false } = {}) {
    clearTimeout(closeTimer);
    if (!isOpen) return;
    hideList();
    isOpen = false;
    pinned = false;
    list.hidden = true;
    el.classList.remove('is-open');
    toggleBtn.setAttribute('aria-expanded', 'false');
    onSound('back');
    if (focus) toggleBtn.focus();
  }

  // --- Pointer: hover opens (mouse and pen), a click or tap pins it open or closes it.
  const hovering = (e) => e.pointerType === 'mouse' || e.pointerType === 'pen';
  el.addEventListener('pointerenter', (e) => { if (hovering(e)) open(); });
  el.addEventListener('pointerleave', (e) => {
    if (!hovering(e) || pinned || el.contains(document.activeElement)) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => close(), CLOSE_DELAY);
  });
  el.addEventListener('pointerover', (e) => {
    if (!hovering(e)) return;
    const slot = e.target.closest('[data-pack-slot]');
    if (slot && shown !== slot.dataset.packSlot) { showList(slot.dataset.packSlot); onSound('move'); }
  });
  let lastPointer = 'mouse';
  el.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
  toggleBtn.addEventListener('click', () => {
    if (isOpen && pinned) close();
    else open({ pin: true });
  });
  el.addEventListener('click', (e) => {
    const slot = e.target.closest('[data-pack-slot]');
    if (slot) {
      pinned = true;
      const keyed = !e.detail; // (Enter or Space: into the list)
      // A tap on an open item closes its list; a mouse click keeps the list its hover opened.
      if (shown === slot.dataset.packSlot && !keyed && lastPointer === 'touch') hideList();
      else showList(slot.dataset.packSlot, { focus: keyed });
      return;
    }
    const opt = e.target.closest('[data-pack-option]');
    if (opt && !opt.disabled && shown) {
      // (A pick pins it open: the list can change under the pointer, the option picked gone.)
      pinned = true;
      byId[shown].pick(opt.dataset.packOption); // (the page may refresh() it right away)
      onSound('select');
      opt.classList.remove('is-hit');
      void opt.offsetWidth;
      opt.classList.add('is-hit');
      const id = opt.dataset.packOption;
      requestAnimationFrame(() => {
        // (What's current may have changed. A mouse click that left focus on the page puts
        // it on the option, as a key would.)
        const a = document.activeElement;
        redraw(id, el.contains(a) || a === document.body);
      });
    }
  });
  // A press anywhere else closes it.
  document.addEventListener('pointerdown', (e) => { if (isOpen && !el.contains(e.target)) close(); });

  // --- Keys, within the pack. (Esc stops here, so the page doesn't also go back a screen.)
  el.addEventListener('keydown', (e) => {
    const slot = e.target.closest('[data-pack-slot]');
    const opt = e.target.closest('[data-pack-option]');
    const move = (els, from, by) => {
      const i = els.indexOf(from);
      const next = els[(i + by + els.length) % els.length];
      next?.focus();
      if (next) onSound('move');
      return next;
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (opt && shown) { const id = shown; hideList(); slotOf(id).focus(); } else close({ focus: true });
      return;
    }
    if (slot && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      const next = move(slots(), slot, e.key === 'ArrowUp' ? -1 : 1);
      if (shown && next) showList(next.dataset.packSlot);
    } else if (slot && e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      showList(slot.dataset.packSlot, { focus: true });
    } else if (opt && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      move([...listOf(shown).querySelectorAll('.pack-option:not(:disabled)')], opt, e.key === 'ArrowUp' ? -1 : 1);
    } else if (opt && e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      slotOf(shown).focus();
    } else if (e.target === toggleBtn && e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      slots().at(-1)?.focus();
    }
  });
  // Focus leaving the pack (tabbing away) closes it.
  el.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !el.contains(e.relatedTarget)) close();
  });

  return {
    el,
    open,
    close,
    get isOpen() { return isOpen; },
    /** The I key: open it and put focus on the first item, or close it. */
    toggle() {
      if (isOpen) close({ focus: false });
      else open({ pin: true, focus: true });
    },
    /**
     * The page's state changed (a new weapon landed, the knight left…): leave out the items
     * that aren't available now, and redraw and refit the list that's showing (also after
     * the page moves the pack).
     */
    refresh() {
      const id = focusedOption();
      if (isOpen) sortItems();
      else for (const it of items) if (it.state) itemOf(it.id).dataset.state = it.state() ?? '';
      if (shown) redraw(id, id !== null);
      // (Its item left the pack with focus in its list: the first item there now, or the pack.)
      else if (id !== null) (slots()[0] ?? toggleBtn).focus({ preventScroll: true });
    },
  };
}

/** Why a motion option is off (rings, the living weapon, gestures). */
export const MOTION_OFF = 'Off while your device asks for reduced motion.';
/** What the living weapon does. */
const LIVING_TIP = 'The weapon pulls free of the fire for a flourish, then plunges back.';
/** Why the finishes are off for a style that draws no steel ("Black & Gold and First Build wear their own colors."). */
export const OWN_COLORS = (() => {
  const names = Object.keys(STYLES).filter((k) => !STYLES[k].finish).map((k) => STYLE_NAMES[k]);
  if (names.length < 2) return `${names[0] ?? 'This style'} wears its own colors.`;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} wear their own colors.`;
})();

/** The Anvil's groups' headings (the content's, else these). */
const weaponGroupLabel = (group) => ({
  swords: ui.packSwords ?? 'Swords', greatswords: ui.packGreatswords ?? 'Greatswords',
  polearms: ui.packPolearms ?? 'Polearms', axes: ui.packAxes ?? 'Axes & Hammers',
})[group] ?? group;

/**
 * The bonfire's items: the map, the anvil, the spell tome, and the knight when the page
 * has one (the site, Bonfire Live and the Painter share them; each page says what the fire
 * is doing and what a pick does).
 * @param {object} o
 * @param {() => { scenery: string, weapon: string, element: string, flame: string, helmet?: string | null,
 *   presence?: 'away' | 'arriving' | 'resting' | 'leaving', style?: string | null, finish?: string | null } | null} o.state
 *   null before the scene loads; `helmet` is the knight's ('great' | 'armet' | 'bascinet', the
 *   one he's putting on mid-swap), null while there's no knight (not there, or still loading);
 *   `presence` the site's knight's comings and goings (fire.knights.presence; left out, as in
 *   Bonfire Live, he's simply there while he has a helmet); `style` and `finish` the ones he
 *   wears (knightStyles.js STYLES, steel.js FINISHES)
 * @param {() => boolean} o.busy       a weapon is being forged or is swinging (the living weapon waits)
 * @param {boolean} [o.reducedMotion]  no rings, living weapon or gestures then (each says why)
 * @param {(key: string) => void} o.onScene
 * @param {(key: string) => void} o.onWeapon
 * @param {() => void} o.onRing
 * @param {() => void} o.onLiving   the Anvil's first option: the weapon in the fire comes alive
 * @param {(key: string) => void} o.onElement
 * @param {(key: string) => void} o.onFlame   new flame colors (a flame from the rotation)
 * @param {string} [o.elementTip]  what else a new element does on this page, as the elements'
 *   tooltip (the site's forges a new weapon in it; Bonfire Live's recolors the one there)
 * @param {(key: string) => void} [o.onHelmet]  the knight puts on this helmet (the Knight item is there only with this)
 * @param {(name: string) => void} [o.onGesture] the knight makes this gesture (GESTURE_NAMES)
 * @param {(key: string) => void} [o.onStyle]   he's drawn in this style (STYLE_NAMES; the item offers styles only with this)
 * @param {(key: string) => void} [o.onFinish]  his armor takes this finish (FINISH_NAMES; only with this, and
 *   only for the styles that draw steel: the others' finishes are off, and say why)
 * @param {() => void} [o.onSummon]   summon him (while he's away: the item offers only "Summon" then)
 * @param {() => void} [o.onDismiss]  send him off (while he rests: "Send Him Off")
 * @param {() => boolean} [o.hasKnight]  false leaves the Knight item out of the pack for now
 *   (the site: his model didn't load, or the admin has him off); a knight who's away (his
 *   sign waiting), forming or burning away keeps it
 */
export function bonfireItems({
  state, busy, reducedMotion = false, onScene, onWeapon, onRing, onLiving, onElement, onFlame, elementTip = '',
  onHelmet, onGesture, onStyle, onFinish, onSummon, onDismiss, hasKnight,
}) {
  const now = () => state() ?? {};
  /** A tooltip for an option, when there's one to give. @param {string} [tip] */
  const tipped = (tip) => (tip ? { tip } : {});
  const items = [
    {
      id: 'map', name: ui.packMap ?? 'Map', verb: ui.packMapVerb ?? 'Fast Travel', icon: 'map',
      options: () => Object.entries(SCENERIES).map(([id, label]) => ({ id, label, current: now().scenery === id, disabled: !state() })),
      pick: onScene,
    },
    {
      // The living weapon first (it's the weapon in the fire that moves), then every weapon
      // by kind, even the ones the admin left out of the random draw.
      id: 'anvil', name: ui.packAnvil ?? 'Anvil', verb: ui.packAnvilVerb ?? 'Swap Weapon', icon: 'anvil',
      options: () => [
        { id: 'living', label: ui.packLiving ?? 'Living Weapon', disabled: !state() || reducedMotion || busy(), ...tipped(reducedMotion ? MOTION_OFF : LIVING_TIP) },
        ...Object.entries(WEAPON_GROUPS).flatMap(([group, keys]) => [
          { heading: true, label: weaponGroupLabel(group) },
          ...keys.filter((id) => Object.hasOwn(weapons, id)).map((id) => ({ id, label: weapons[id], current: now().weapon === id, disabled: !state() })),
        ]),
      ],
      pick: (id) => (id === 'living' ? onLiving() : onWeapon(id)),
    },
    {
      id: 'tome', name: ui.packTome ?? 'Spell Tome', verb: ui.packTomeVerb ?? 'Cast a Spell', icon: 'tome',
      options: () => [
        {
          id: 'ring', label: `${ui.packRing ?? 'Ring of'} ${elements[now().element ?? 'fire']?.name ?? ''}`.trim(),
          disabled: !state() || reducedMotion, ...tipped(reducedMotion ? MOTION_OFF : ''),
        },
        { heading: true, label: ui.packSpells ?? 'Elements' },
        ...ELEMENT_IDS.map((id) => ({ id: `element:${id}`, label: elements[id]?.name ?? id, current: now().element === id, disabled: !state(), ...tipped(elementTip) })),
        { heading: true, label: ui.packColors ?? 'Flame Colors' },
        // Each palette in rotation, named as the fire would be in the element it's in now
        // ("Azure Frost"), with a swatch of its bright tone.
        ...rotation().map((key) => ({
          id: `flame:${key}`, label: flameTitle(flames[key].name, now().element ?? 'fire'),
          swatch: flames[key].ramp[2], current: now().flame === key, disabled: !state(),
        })),
      ],
      pick: (id) => {
        if (id === 'ring') onRing();
        else if (id.startsWith('element:')) onElement(id.slice(8));
        else if (id.startsWith('flame:')) onFlame(id.slice(6));
      },
    },
  ];
  if (onHelmet) {
    // (A page that tracks his comings and goings says so; one that doesn't has him there.)
    const presence = () => now().presence ?? (now().helmet ? 'resting' : 'away');
    items.push({
      id: 'knight', name: ui.packKnight ?? 'Knight', verb: ui.packKnightVerb ?? 'Summon & Tend', icon: 'helm',
      options: () => {
        const p = presence();
        // Away (his sign waits on the ground), or burning away into it: only the summons.
        if (onSummon && (p === 'away' || p === 'leaving')) {
          return [{ id: 'summon', label: ui.packSummon ?? 'Summon', disabled: !state() || p !== 'away' }];
        }
        const helmet = now().helmet ?? null; // (no knight: nothing to pick)
        const off = !helmet || p !== 'resting'; // (forming: nothing yet)
        const style = now().style ?? null;
        const steel = !!STYLES[style]?.finish; // (the finishes are the steel's colors)
        const ownColors = !!style && !steel; // (a style that draws no steel: the finishes say why they're off)
        return [
          ...(onDismiss ? [{ id: 'dismiss', label: ui.packDismiss ?? 'Send Him Off', disabled: off }] : []),
          // (Gestures are motion: none for reduced motion, where he sits still.)
          { heading: true, label: ui.packGestures ?? 'Gestures', ...(reducedMotion ? { note: MOTION_OFF } : {}) },
          ...Object.entries(GESTURE_NAMES).map(([id, label]) => ({ id: `gesture:${id}`, label, disabled: off || reducedMotion, ...tipped(reducedMotion ? MOTION_OFF : '') })),
          { heading: true, label: ui.packHelmets ?? 'Helmet' },
          ...Object.entries(HELMET_NAMES).map(([id, label]) => ({ id: `helm:${id}`, label, current: helmet === id, disabled: off })),
          ...(onStyle ? [
            { heading: true, label: ui.packStyles ?? 'Style' },
            ...Object.entries(STYLE_NAMES).map(([id, label]) => ({ id: `style:${id}`, label, current: style === id, disabled: off, ...tipped(STYLES[id]?.hint) })),
          ] : []),
          ...(onFinish ? [
            { heading: true, label: ui.packFinishes ?? 'Finish', ...(ownColors ? { note: OWN_COLORS } : {}) },
            ...Object.entries(FINISH_NAMES).map(([id, label]) => ({
              id: `finish:${id}`, label, current: steel && now().finish === id, disabled: off || !steel, ...tipped(ownColors ? OWN_COLORS : ''),
            })),
          ] : []),
        ];
      },
      pick: (id) => {
        if (id === 'summon') onSummon?.();
        else if (id === 'dismiss') onDismiss?.();
        else if (id.startsWith('helm:')) onHelmet(id.slice(5));
        else if (id.startsWith('style:')) onStyle?.(id.slice(6));
        else if (id.startsWith('finish:')) onFinish?.(id.slice(7));
        else if (id.startsWith('gesture:')) onGesture?.(id.slice(8));
      },
      // (Its icon: the helm's eye slit dark while he's away.)
      state: () => (state() ? presence() : null),
      ...(hasKnight ? { available: hasKnight } : {}),
    });
  }
  return items;
}
