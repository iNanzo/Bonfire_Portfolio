// The pack: a backpack in the bottom-right corner, the same on the site and in Bonfire Live.
// Hover it (or tap it, or press I) and it opens: its items rise out of it, one slot each.
// Hovering an item (or tapping it, or Enter on it) shows what it can do as a text list
// beside it, like a game's item menu:
//
//   Map         swap the scene around the fire
//   Anvil       swap the weapon in it
//   Spell Tome  the element's ring, the living weapon, a new spell (element) and new
//               bonfire colors
//
// The page hands each item its options (what's current, what's unavailable right now)
// and what picking one does. Keys: arrows move (up/down through the items, left into an
// item's list and right back out), Enter picks, Esc closes.
import { esc, corners } from '../html.js';
import { icon } from './pixelArt.js';
import { weapons, ui } from '../content.js';
import { elements, flameTitle } from '../elements.js';
import { flames, rotation } from '../palette.js';
import { ELEMENT_IDS } from '../effectsDefaults.js';
import { SCENERIES } from '../sceneries.js';

const CLOSE_DELAY = 320; // ms the pack stays open after the pointer leaves it

/**
 * @param {object} o
 * @param {Array<{ id: string, name: string, verb: string, icon: string,
 *   options: () => Array<{ id?: string, label: string, current?: boolean, disabled?: boolean, heading?: boolean, swatch?: string }>,
 *   pick: (id: string) => void }>} o.items
 * @param {string} [o.label]     the pack's own name (the button's label)
 * @param {string} [o.keyHint]   the key that opens it, shown on the button
 * @param {(kind: 'open' | 'move' | 'select' | 'back') => void} [o.onSound]
 * @param {() => void} [o.onOpen]  it opened (the site counts it as a discovery)
 */
export function createPack({ items, label = 'Pack', keyHint = 'I', onSound = () => {}, onOpen = () => {} }) {
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
            <ul class="pack-options" role="list" data-pack-options></ul>
          </div>
        </li>`).join('')}
    </ul>
    <button class="pack-toggle" type="button" aria-expanded="false" aria-controls="pack-items" data-pack-toggle
            title="${esc(label)} (${esc(keyHint)})">
      ${icon('backpack', 'px-backpack')}
      <span class="visually-hidden">${esc(label)}</span>
      <kbd aria-hidden="true">${esc(keyHint)}</kbd>
    </button>`;

  const toggleBtn = el.querySelector('[data-pack-toggle]');
  const list = el.querySelector('.pack-items');
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const slotOf = (id) => el.querySelector(`[data-pack-slot="${id}"]`);
  const listOf = (id) => el.querySelector(`[data-pack-list="${id}"]`);
  let isOpen = false;
  let pinned = false; // opened by a click or a key: it stays open until closed the same way
  let shown = null;   // the item whose list is showing
  let closeTimer = 0;

  function drawOptions(id) {
    const it = byId[id];
    const ul = listOf(id).querySelector('[data-pack-options]');
    const options = it.options();
    listOf(id).classList.toggle('is-long', options.length > 12); // (a long list, like the weapons, goes in two columns)
    ul.innerHTML = options.map((o) => (o.heading
      ? `<li class="pack-heading" aria-hidden="true">${esc(o.label)}</li>`
      : `<li><button class="pack-option${o.current ? ' is-current' : ''}" type="button" data-pack-option="${esc(o.id)}"
            aria-pressed="${o.current ? 'true' : 'false'}"${o.disabled ? ' disabled' : ''}>
            <span class="cursor" aria-hidden="true"></span>${o.swatch ? `<span class="pack-swatch" style="--sw: ${esc(o.swatch)}" aria-hidden="true"></span>` : ''}<span class="pack-option-label">${esc(o.label)}</span>${o.current ? '<span class="gem" aria-hidden="true"></span>' : ''}
          </button></li>`)).join('');
  }

  function showList(id, { focus = false } = {}) {
    if (shown && shown !== id) hideList();
    if (!id) return;
    shown = id;
    drawOptions(id);
    const l = listOf(id);
    l.hidden = false;
    l.classList.remove('is-in');
    void l.offsetWidth; // (restart the entrance)
    l.classList.add('is-in');
    slotOf(id).setAttribute('aria-expanded', 'true');
    el.querySelector(`[data-pack-item="${id}"]`).classList.add('is-shown');
    if (focus) l.querySelector('.pack-option:not(:disabled)')?.focus();
  }
  function hideList() {
    if (!shown) return;
    listOf(shown).hidden = true;
    slotOf(shown).setAttribute('aria-expanded', 'false');
    el.querySelector(`[data-pack-item="${shown}"]`).classList.remove('is-shown');
    shown = null;
  }

  function open({ pin = false, focus = false } = {}) {
    clearTimeout(closeTimer);
    pinned = pinned || pin;
    if (!isOpen) {
      isOpen = true;
      list.hidden = false;
      el.classList.add('is-open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      onSound('open');
      onOpen();
    }
    if (focus) slotOf(items[0].id).focus();
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
      byId[shown].pick(opt.dataset.packOption);
      onSound('select');
      opt.classList.remove('is-hit');
      void opt.offsetWidth;
      opt.classList.add('is-hit');
      const id = opt.dataset.packOption;
      requestAnimationFrame(() => {
        if (!shown) return;
        drawOptions(shown); // (what's current may have changed)
        if (el.contains(document.activeElement) || document.activeElement === document.body) listOf(shown).querySelector(`[data-pack-option="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
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
      const next = move([...el.querySelectorAll('[data-pack-slot]')], slot, e.key === 'ArrowUp' ? -1 : 1);
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
      slotOf(items[items.length - 1].id).focus();
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
    /** Redraw the list that's showing (the page's state changed: a new weapon landed…). */
    refresh() { if (shown) drawOptions(shown); },
  };
}

/**
 * The bonfire's three items (the site and Bonfire Live share them; each page says what the
 * fire is doing and what a pick does).
 * @param {object} o
 * @param {() => { scenery: string, weapon: string, element: string, flame: string } | null} o.state  null before the scene loads
 * @param {() => boolean} o.busy       a weapon is being forged or is swinging (the living weapon waits)
 * @param {boolean} [o.reducedMotion]  no rings or living weapon then
 * @param {(key: string) => void} o.onScene
 * @param {(key: string) => void} o.onWeapon
 * @param {() => void} o.onRing
 * @param {() => void} o.onLiving
 * @param {(key: string) => void} o.onElement
 * @param {(key: string) => void} o.onFlame   new bonfire colors (a flame from the rotation)
 */
export function bonfireItems({ state, busy, reducedMotion = false, onScene, onWeapon, onRing, onLiving, onElement, onFlame }) {
  const now = () => state() ?? {};
  return [
    {
      id: 'map', name: ui.packMap ?? 'Map', verb: ui.packMapVerb ?? 'Swap Scene', icon: 'map',
      options: () => Object.entries(SCENERIES).map(([id, label]) => ({ id, label, current: now().scenery === id, disabled: !state() })),
      pick: onScene,
    },
    {
      id: 'anvil', name: ui.packAnvil ?? 'Anvil', verb: ui.packAnvilVerb ?? 'Swap Weapon', icon: 'anvil',
      options: () => Object.entries(weapons).map(([id, label]) => ({ id, label, current: now().weapon === id, disabled: !state() })),
      pick: onWeapon,
    },
    {
      id: 'tome', name: ui.packTome ?? 'Spell Tome', verb: ui.packTomeVerb ?? 'Cast a Spell', icon: 'tome',
      options: () => {
        const off = !state() || reducedMotion;
        return [
          { id: 'ring', label: `${ui.packRing ?? 'Ring of'} ${elements[now().element ?? 'fire']?.name ?? ''}`.trim(), disabled: off },
          { id: 'living', label: ui.packLiving ?? 'Living Weapon', disabled: off || busy() },
          { heading: true, label: ui.packSpells ?? 'Swap Spells' },
          ...ELEMENT_IDS.map((id) => ({ id: `element:${id}`, label: elements[id]?.name ?? id, current: now().element === id, disabled: !state() })),
          { heading: true, label: ui.packColors ?? 'Bonfire Colors' },
          // Each palette in rotation, named as the fire would be in the element it's in now
          // ("Azure Frost"), with a swatch of its bright tone.
          ...rotation().map((key) => ({
            id: `flame:${key}`, label: flameTitle(flames[key].name, now().element ?? 'fire'),
            swatch: flames[key].ramp[2], current: now().flame === key, disabled: !state(),
          })),
        ];
      },
      pick: (id) => {
        if (id === 'ring') onRing();
        else if (id === 'living') onLiving();
        else if (id.startsWith('element:')) onElement(id.slice(8));
        else if (id.startsWith('flame:')) onFlame(id.slice(6));
      },
    },
  ];
}
