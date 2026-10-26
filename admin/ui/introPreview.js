// The Invitation page's intro preview, beside the page (main.js puts it in the preview slot,
// as preview.js's live preview is on the Look & Feel pages): the real toy in a frame, opened as
// /invitation/?preview (src/invitation/preview.js has the toy's side), playing one chat box of
// the draft (unsaved) intro: he turns to the camera (walks in again with Replay), the box's shot,
// face and animation, its line typed out with its tags in the draft's colours, its replies; then
// it holds. A reply picked or a tap in the frame follows the script, and the picker follows it.
//   - Box: the box to play, the one being edited by default (edit(path): the form's focus);
//     picking one plays it. Play plays it from where he stands; Replay from the start of the
//     scene; Next plays the box after it (the toy says where that is; none at a box with
//     replies or at the end). Desktop and Phone size the frame (preview.js's sizes), scaled to fit.
//   - Once something has played, an edit to the intro or the text colours plays the box again
//     with it (update(), debounced), so the preview keeps up with the typing.
//   - Messages go only to the site's origin and are taken only from the frame at it; the toy
//     takes them only from this page's origin (it's told it in the address, and checks it).
// Its words are Title Case labels and sentence help; no inline styles (the CSP): sizes go
// through the style object, as el() does. No imports outside the admin's own and the toy's
// pure lists, so the tests run it on a stand-in document.
import { el } from './el.js';
import { DEFAULT_TEXT_COLORS, plainText } from '../../src/invitation/markup.js';
import { INVITATION_STARTERS } from './invitationSchema.js';
import { titleCase } from './text.js';

/** The message that plays a box, and the toy's answers (src/invitation/preview.js's own names). */
export const INTRO_PREVIEW_MESSAGE = 'invitation-intro-preview';
export const INTRO_PREVIEW_STATE = 'invitation-intro-preview-state';
/** The frame's sizes, CSS px (preview.js's: a desktop and a phone). */
export const INTRO_PREVIEW_SIZES = { desktop: [1280, 800], phone: [390, 780] };
/** How long the draft settles before it's played again, ms. */
const SETTLE_MS = 350;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The draft's intro, or the toy's own when it has none (Start From the Toy’s Own's).
 * @param {any} draft
 */
export const draftIntro = (draft) =>
  isObj(draft?.invitation?.intro) ? draft.invitation.intro : INVITATION_STARTERS['invitation.intro']();

/**
 * The boxes the toy can play (each with an id, the first of a doubled one: content.js
 * introFrom's), by id and how its line starts (its tags left out).
 * @param {any} draft
 * @returns {{id: string, label: string}[]}
 */
export function previewBoxes(draft) {
  const boxes = draftIntro(draft).boxes;
  /** @type {{id: string, label: string}[]} */
  const out = [];
  for (const b of Array.isArray(boxes) ? boxes : []) {
    if (!isObj(b) || typeof b.id !== 'string' || !b.id || out.some((o) => o.id === b.id)) continue;
    const words = Array.from(plainText(String(b.text ?? '')).trim());
    const start = words.length > 28 ? `${words.slice(0, 27).join('')}…` : words.join('');
    out.push({ id: b.id, label: start ? `${b.id}: ${start}` : b.id });
  }
  return out;
}

/**
 * The box a form field belongs to (its data-path, e.g. invitation.intro.boxes[2].text), or null.
 * @param {any} draft
 * @param {string|undefined|null} path
 */
export function boxAt(draft, path) {
  const m = /^invitation\.intro\.boxes\[(\d+)\]/.exec(path ?? '');
  const b = m ? draftIntro(draft).boxes?.[Number(m[1])] : null;
  return isObj(b) && typeof b.id === 'string' && b.id ? b.id : null;
}

/**
 * The message that plays `box` from the draft: its intro (the toy mends it as it mends the saved
 * one), its text colours (the toy's own without), the size shown and whether to restart.
 * @param {any} draft
 * @param {string} box
 * @param {{restart?: boolean, viewport?: 'desktop'|'phone'}} [o]
 */
export function previewMessage(draft, box, { restart = false, viewport = 'desktop' } = {}) {
  const colors = draft?.invitation?.text?.colors;
  return {
    type: INTRO_PREVIEW_MESSAGE,
    script: structuredClone(draftIntro(draft)),
    palette: structuredClone(Array.isArray(colors) ? colors : DEFAULT_TEXT_COLORS),
    box,
    viewport,
    restart,
  };
}

/**
 * The height the frame may take, CSS px, in a window `tall` px high: most of it beside the page,
 * less in the slot pinned over it (narrower than 1280 px: 48% of the window, its head and tools
 * taken out).
 * @param {number|undefined} tall
 * @param {boolean} pinned
 */
export const roomFor = (tall, pinned) =>
  Math.max(160, Math.round((tall || 800) * (pinned ? 0.48 : 0.72)) - (pinned ? 96 : 150));

/**
 * The frame's scale to fit the stage's width and the room down the window (never over 1), and
 * how far in it starts to stand in the middle, CSS px.
 * @param {[number, number]} size  the frame's own width and height
 * @param {{width: number, room: number}} o  the stage's width; the height it may take
 */
export function fitFrame([w, h], { width, room }) {
  const scale = Math.min(width / w, room / h, 1);
  return { scale, left: Math.max(0, Math.round((width - w * scale) / 2)) };
}

/**
 * The pane. `draft()` is the draft now; `win` the window it listens on (the tests' stand-in).
 * @param {string|undefined} siteUrl  the site the frame loads (the session's)
 * @param {{draft: () => any, win?: any, settle?: number}} o
 */
export function createIntroPreview(siteUrl, { draft, win = globalThis.window, settle = SETTLE_MS }) {
  const here = win?.location?.href ?? 'http://localhost/';
  const url = new URL('invitation/', new URL(siteUrl || '/', here));
  url.searchParams.set('preview', '1');
  url.searchParams.set('admin', new URL(here).origin);
  const origin = url.origin;
  const st = {
    ready: false,
    /** something has played: edits play the box again */
    armed: false,
    /** the box the toy says is up, and where its Next goes */
    playing: /** @type {string|null} */ (null),
    next: /** @type {string|null} */ (null),
    viewport: /** @type {'desktop'|'phone'} */ ('desktop'),
    /** the message waiting for the frame to be ready */
    pending: /** @type {any} */ (null),
    /** what the last message played from (the intro and colours), to skip edits elsewhere */
    sent: '',
    timer: /** @type {any} */ (0),
  };

  const frame = el('iframe', {
    'aria-label': 'Preview of the invitation’s intro',
    class: 'preview-frame',
    loading: 'lazy',
  });
  const stage = el('div', { class: 'preview-stage' }, frame);
  const state = el('span', { class: 'preview-state', text: 'Loading…' });
  const say = (text, tone = '') => {
    state.textContent = text;
    if (tone) state.dataset.tone = tone;
    else delete state.dataset.tone;
  };

  const picker = el('select', {
    'aria-label': 'Box',
    'data-tip': 'The chat box to play: the one you’re editing, or pick another',
    onchange: () => play(false),
  });
  const button = (label, tip, onclick, cls = 'button small') =>
    el('button', { type: 'button', class: cls, text: titleCase(label), 'data-tip': tip, onclick });
  const playBtn = button(
    'Play',
    'Play this box from your draft: he turns to you, then its shot, face, move and line',
    () => play(false),
  );
  const replayBtn = button('Replay', 'Play it again from the start: he walks back in and turns to you first', () =>
    play(true),
  );
  const nextBtn = button('Next', 'Play the box this one goes on to', () => {
    if (!st.next) return;
    picker.value = st.next;
    play(false);
  });
  nextBtn.disabled = true;
  const sizes = Object.keys(INTRO_PREVIEW_SIZES).map((k) =>
    el('button', {
      type: 'button',
      class: 'button small',
      text: titleCase(k),
      'data-viewport': k,
      'aria-pressed': String(k === st.viewport),
      'data-tip': k === 'phone' ? 'Show it at a phone’s size (390 × 780)' : 'Show it at a desktop’s size (1280 × 800)',
      onclick: () => setViewport(/** @type {'desktop'|'phone'} */ (k)),
    }),
  );

  /** The picker's boxes, as the draft has them now (the pick kept while it's there). */
  function fillBoxes() {
    const boxes = previewBoxes(draft());
    const keep = picker.value;
    picker.replaceChildren(...boxes.map((b) => el('option', { value: b.id, text: b.label })));
    picker.value = boxes.some((b) => b.id === keep) ? keep : (boxes[0]?.id ?? '');
    const none = !boxes.length;
    picker.disabled = playBtn.disabled = replayBtn.disabled = none;
    if (none) say('No Boxes Yet');
    return boxes;
  }

  /** @param {any} msg */
  function post(msg) {
    if (!st.ready) {
      st.pending = msg;
      return;
    }
    frame.contentWindow?.postMessage(msg, origin);
  }

  /**
   * Play the box picked (restart: from the start of the scene).
   * @param {boolean} restart
   */
  function play(restart) {
    clearTimeout(st.timer);
    const box = picker.value;
    if (!box) return;
    st.armed = true;
    const d = draft();
    st.sent = sentKey(d);
    post(previewMessage(d, box, { restart, viewport: st.viewport }));
  }
  const sentKey = (d) => JSON.stringify([d?.invitation?.intro ?? null, d?.invitation?.text?.colors ?? null]);

  /** @param {'desktop'|'phone'} k */
  function setViewport(k) {
    st.viewport = k;
    for (const b of sizes) b.setAttribute('aria-pressed', String(b.getAttribute('data-viewport') === k));
    fit();
  }

  function fit() {
    const [w, h] = INTRO_PREVIEW_SIZES[st.viewport];
    const width = stage.clientWidth || w;
    // (The room it has down the window: the slot pinned over the page under 1280 px is shorter.)
    const pinned = Boolean(win?.matchMedia?.('(max-width: 1279px)').matches);
    const { scale, left } = fitFrame([w, h], { width, room: roomFor(win?.innerHeight, pinned) });
    frame.style.setProperty('width', `${w}px`);
    frame.style.setProperty('height', `${h}px`);
    frame.style.setProperty('transform', `translateX(${left}px) scale(${scale})`);
    stage.style.setProperty('height', `${Math.round(h * scale)}px`);
  }
  if (typeof win?.ResizeObserver === 'function') new win.ResizeObserver(fit).observe(stage);

  win?.addEventListener?.('message', (/** @type {MessageEvent} */ e) => {
    const d = e.data;
    if (e.source !== frame.contentWindow || e.origin !== origin || d?.type !== INTRO_PREVIEW_STATE) return;
    if (d.state === 'ready') {
      st.ready = true;
      say('Ready', 'ok');
      // (Loaded again: the box that was asked for, or the one playing, again.)
      const again =
        st.pending ??
        (st.armed && picker.value ? previewMessage(draft(), picker.value, { viewport: st.viewport }) : null);
      st.pending = null;
      if (again) post(again);
    } else if (d.state === 'playing' && typeof d.box === 'string') {
      st.playing = d.box;
      st.next = typeof d.next === 'string' && d.next ? d.next : null;
      if ([...picker.children].some((o) => o.value === d.box)) picker.value = d.box;
      nextBtn.disabled = !st.next;
      say(`Playing ${d.box}`, 'ok');
    } else if (d.state === 'done') {
      st.playing = st.next = null;
      nextBtn.disabled = true;
      say('Done');
    }
  });

  const reload = () => {
    st.ready = false;
    say('Loading…');
    frame.src = url.href;
  };

  const pane = el(
    'aside',
    { class: 'preview intro-preview', 'aria-label': 'Intro Preview' },
    el(
      'div',
      { class: 'preview-head' },
      el('h2', { text: titleCase('Intro Preview') }),
      state,
      el('a', {
        class: 'link-button',
        href: new URL('invitation/', new URL(siteUrl || '/', here)).href,
        target: '_blank',
        rel: 'noopener',
        text: `${titleCase('Open the Toy')} ↗`,
      }),
    ),
    stage,
    el(
      'div',
      { class: 'preview-tools' },
      picker,
      playBtn,
      replayBtn,
      nextBtn,
      el('div', { class: 'segmented', role: 'group', 'aria-label': 'Viewport' }, sizes),
    ),
    el('p', {
      class: 'help',
      text: 'Plays a chat box from your unsaved draft. Tap in it to go on or pick a reply; edits play the box again. Visitors see the saved intro.',
    }),
  );
  fillBoxes();

  return {
    pane,
    /** Start loading the toy (the first time it shows), sized at once. */
    open() {
      if (!frame.src) reload();
      fill();
    },
    /** The draft changed: the boxes again, and once something has played, the box again (debounced). */
    update() {
      fillBoxes();
      if (!st.armed || sentKey(draft()) === st.sent) return;
      clearTimeout(st.timer);
      st.timer = setTimeout(() => play(false), settle);
    },
    /**
     * A field took the focus: its box is the one being edited (picked; played once something has).
     * @param {string|undefined|null} path  its data-path
     */
    edit(path) {
      const id = boxAt(draft(), path);
      if (!id || id === picker.value) return;
      picker.value = id;
      if (st.armed) {
        clearTimeout(st.timer);
        st.timer = setTimeout(() => play(false), settle);
      }
    },
    /** Load the toy again. */
    reload,
  };

  function fill() {
    fit();
    win?.requestAnimationFrame?.(fit);
  }
}
