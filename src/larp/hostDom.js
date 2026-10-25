// The host window's DOM: draws host.js's view into the root, delegates its actions (dom.js bind),
// keeps focus through re-renders and around the confirmation dialog, holds a re-render while an
// input method composes, announces changes in one polite live region, listens for the keys and
// ticks (clocks, heartbeat, reveal advance), and keeps Judge Mode's lock where every host window
// reads it. Every decision is a pure function in host.js (screenCtx, hostView, shellActions,
// keyAction, tabKey, liveNews, revealDue, tickKey), app.js (bootPlan) or uiState.js (the lock);
// this file only wires them.
import { HEARTBEAT_MS, createChannel, createHostLink } from './channel.js';
import { bootPlan, createApp } from './app.js';
import { JUDGE_LOCK_KEY, createUiStore, judgeLockPatch, judgeLockText } from './uiState.js';
import { clock as browserClock, newId, storage } from './browser.js';
import { bind, download, patch, tickClocks } from './dom.js';
import { t } from './strings.js';
import { warmFonts } from './fonts.js';
import {
  hostKeys,
  hostView,
  isControl,
  keyAction,
  liveNews,
  reporter,
  resumeFlash,
  revealDue,
  screenCtx,
  shellActions,
  tabKey,
  tickKey,
  unreadableFlash,
} from './host.js';
import { typing } from '../ui/shell.js';
import { createKeysOverlay } from '../ui/keysOverlay.js';
import { returnFocus } from '../ui/focus.js';
import { applyFlame } from '../ui/theme.js';
import { flameOr } from '../palette.js';

/**
 * @typedef {import('./app.js').App} App
 * @typedef {import('./uiState.js').UiStore} UiStore
 * @typedef {ReturnType<typeof import('./channel.js').createHostLink>} HostLink
 * @typedef {import('./host.js').HostEnv} HostEnv
 * @typedef {import('./dom.js').Handlers} Handlers
 */

/**
 * Focuses `el`, with a text field's caret at the end (after a sign the − toggle just put there).
 * @param {Element|null} el
 */
function focusField(el) {
  const input = /** @type {HTMLInputElement|null} */ (el);
  if (!input?.focus) return;
  input.focus();
  if (typeof input.setSelectionRange !== 'function' || !/^(text|search|)$/.test(input.type ?? '')) return;
  const end = input.value.length;
  try {
    input.setSelectionRange(end, end);
  } catch {
    // (not a text field)
  }
}

/**
 * A selector that finds `el` again after a re-render (its id or data-focus), or null.
 * @param {Element|null} el
 */
function focusKey(el) {
  const h = /** @type {HTMLElement|null} */ (el);
  if (!h || !h.getAttribute) return null;
  if (h.id) return `#${CSS.escape(h.id)}`;
  const key = h.getAttribute('data-focus');
  return key ? `[data-focus="${CSS.escape(key)}"]` : null;
}

/**
 * The shared shortcuts overlay's own words, in the host language (it writes them in English).
 * @param {HTMLElement} el
 * @param {import('./types.js').Lang} lang
 */
function relabelKeys(el, lang) {
  el.querySelector('[data-keys-close]')?.setAttribute('aria-label', t('action.close', lang));
  const filter = el.querySelector('[data-keys-filter]');
  filter?.setAttribute('placeholder', t('label.filterShortcuts', lang));
  const name = filter?.id ? el.querySelector(`label[for="${CSS.escape(filter.id)}"]`) : null;
  if (name) name.textContent = t('label.filterShortcuts', lang);
}

/**
 * @param {HTMLElement} root
 * @param {{ app: App, ui: UiStore, link: HostLink, clock: () => number, openDisplay: () => void }} deps
 * @returns {{ render(): void, linkChanged(): void, destroy(): void }}
 */
export function mountHost(root, { app, ui, link, clock, openDisplay }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  // The one polite live region: outside the re-rendered root, written only when something changed.
  const live = doc.createElement('div');
  live.className = 'visually-hidden';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  root.after(live);
  /** @type {ReturnType<typeof liveNews>['state']|null} */
  let news = null;
  // An input method is composing (Vietnamese Telex…): a re-render would replace its field.
  let composing = false;
  // While the display is closed: can this page be fetched again (a reopened display needs it)?
  // navigator.onLine misses a venue Wi-Fi without internet, so a small HEAD request asks.
  let reachable = true;
  let lastProbe = -Infinity;
  const probe = () => {
    lastProbe = clock();
    fetch(`${location.pathname}?online`, { method: 'HEAD', cache: 'no-store' })
      .then(
        (r) => r.ok,
        () => false,
      )
      .then((ok) => {
        if (ok !== reachable) {
          reachable = ok;
          schedule();
        }
      });
  };
  /** @type {HostEnv} */
  const env = {
    now: clock,
    report: reporter(ui),
    confirm: (pending) => ui.set({ confirm: pending }),
    download,
    openDisplay,
    // Drawn first: a handler may move focus to what its own change just made appear.
    focus: (sel) => {
      render();
      focusField(root.querySelector(sel));
    },
    post: (msg) => link.post(msg),
  };
  /** @type {Handlers} */
  let handlers = {};
  /** @type {{ lang: string, overlay: ReturnType<typeof createKeysOverlay> } | null} */
  let keys = null;
  let flame = '';
  let lastKey = '';
  let lastAuto = '';
  /** @type {string|null} what had focus before the dialog opened (found again by its key) */
  let beforeDialog = null;
  const shell = shellActions({
    app,
    ui,
    env,
    link,
    handlers: () => handlers,
    render,
    openKeys: () => keys?.overlay.open(),
  });

  function render() {
    if (composing) return; // compositionend draws
    const ctx = screenCtx(app, ui, link.status(), clock(), reachable && win?.navigator.onLine !== false);
    if (!ctx) return;
    lastKey = tickKey(ctx.event, ctx.link, ctx.now);
    const { vm, screen, html } = hostView(ctx);
    patch(root, html);
    const said = liveNews(news, vm);
    news = said.state;
    if (said.text) live.textContent = said.text;
    // A field marked data-autofocus takes focus once, when it first appears (Judge Mode's name and
    // PIN fields after a step changes).
    const auto = root.querySelector('[data-autofocus]');
    const autoKey = auto ? auto.id || auto.getAttribute('name') || auto.outerHTML.slice(0, 80) : '';
    if (auto && autoKey !== lastAuto) focusField(auto);
    lastAuto = autoKey;
    const next = /** @type {HTMLElement|null} */ (root.querySelector('[data-action="next"]'));
    if (next) next.dataset.revision = String(ctx.event.revision);
    handlers = { ...shell, ...(screen ? screen.actions(app, ui, env) : {}) };
    doc.documentElement.lang = ctx.lang;
    if (vm.flame !== flame) applyFlame(flameOr((flame = vm.flame)));
    if (keys?.lang !== ctx.lang) {
      keys?.overlay.el.remove();
      keys = {
        lang: ctx.lang,
        overlay: createKeysOverlay({ title: t('label.keyboard', ctx.lang), groups: hostKeys(ctx.lang), doc }),
      };
      relabelKeys(keys.overlay.el, ctx.lang);
    }
    const dialog = root.querySelector('.larp-dialog');
    if (dialog && !dialog.contains(doc.activeElement)) {
      beforeDialog = beforeDialog ?? focusKey(doc.activeElement) ?? '';
      /** @type {HTMLElement|null} */ (dialog.querySelector('[data-focus="confirm.no"]'))?.focus();
    } else if (!dialog && beforeDialog !== null) {
      // Back to what opened it, found by its key in the new markup (the old node is gone).
      const back = beforeDialog ? root.querySelector(beforeDialog) : null;
      returnFocus(back);
      beforeDialog = null;
    }
  }

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), render()));
  };
  const offApp = app.subscribe(schedule);
  const offUi = ui.subscribe(schedule);
  const unbind = bind(root, () => handlers, {
    onDraft: (path, value, liveDraft) => {
      const [form, name] = path.split('.');
      if (form && name) ui.setDraft(form, name, value, { silent: !liveDraft });
    },
  });
  const composeStart = () => (composing = true);
  const composeEnd = () => {
    composing = false;
    schedule();
  };
  root.addEventListener('compositionstart', composeStart);
  root.addEventListener('compositionend', composeEnd);
  win?.addEventListener('online', schedule);
  win?.addEventListener('offline', schedule);

  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    const dialog = root.querySelector('.larp-dialog');
    if (dialog && e.key === 'Tab') {
      // The dialog keeps focus: Tab cycles its buttons.
      const items = /** @type {HTMLElement[]} */ ([...dialog.querySelectorAll('button')]);
      const i = items.indexOf(/** @type {HTMLElement} */ (doc.activeElement));
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      return;
    }
    const target = /** @type {HTMLElement|null} */ (e.target);
    // The tablist keys: ←/→ (wrapping), Home and End move to a tab and select it.
    const tab = target?.getAttribute?.('role') === 'tab' && !e.altKey ? tabKey(e.key, target.dataset.value) : null;
    if (tab && handlers.tab) {
      e.preventDefault();
      handlers.tab({ el: target, event: e, value: tab });
      env.focus(`#larp-tabbtn-${tab}`);
      return;
    }
    const name = keyAction(e, {
      typing: typing(e.target),
      control: isControl(target),
      ui: ui.get(),
      event: app.getEvent(),
      locked: !link.status().active, // (a new window still holding back takes keys, as it takes commands)
    });
    if (!name || !handlers[name]) return;
    e.preventDefault();
    handlers[name]({ el: root, event: e, value: undefined });
  };
  doc.addEventListener('keydown', onKey);

  let lastBeat = 0;
  const timer = setInterval(() => {
    const now = clock();
    if (now - lastBeat >= HEARTBEAT_MS) {
      lastBeat = now;
      link.tick();
    }
    const event = app.getEvent();
    const r = event?.reveal;
    if (r && app.isActive() && revealDue(event, now)) {
      app.dispatch('revealAdvance', {}, { id: `reveal-${r.roundId}-${r.step}-${r.stepStartedAt}` });
    }
    const shown = link.status().display;
    if (shown === 'closed' && now - lastProbe >= PROBE_MS) probe();
    else if (shown === 'open') reachable = true; // (it loaded: the next closing probes afresh)
    if (tickKey(event, link.status(), now) !== lastKey) schedule();
    else tickClocks(root, now);
  }, 250);

  render();
  return {
    render,
    /** The link's status may have changed: re-render only if what's shown did. */
    linkChanged() {
      if (tickKey(app.getEvent(), link.status(), clock()) !== lastKey) schedule();
    },
    destroy() {
      clearInterval(timer);
      cancelAnimationFrame(frame);
      doc.removeEventListener('keydown', onKey);
      root.removeEventListener('compositionstart', composeStart);
      root.removeEventListener('compositionend', composeEnd);
      win?.removeEventListener('online', schedule);
      win?.removeEventListener('offline', schedule);
      live.remove();
      unbind();
      offApp();
      offUi();
      keys?.overlay.el.remove();
    },
  };
}

/** How often the host checks it can still load the page while the display is closed (ms). */
const PROBE_MS = 5000;

/** How long a new host window waits for an older one to answer before it saves or posts (ms). */
export const HELLO_WAIT_MS = 300;

/**
 * The host window: the app on localStorage, the UI state on sessionStorage, the channel and its
 * single-host lock, then the console. Resumes the saved event, or starts a new one; a save it
 * can't read is protected, never written over (app.bootPlan). The window starts holding: it saves
 * and posts nothing until its link has heard whether an older host window holds the event.
 * @param {HTMLElement} root
 * @returns {{ destroy(): void }}
 */
export function startHost(root) {
  void warmFonts(document.fonts); // every face now, while the network is there (U11)
  const channel = createChannel();
  const local = storage('localStorage');
  const app = createApp({ storage: local, clock: browserClock, newId, channel, holding: true });
  const ui = createUiStore({ storage: storage('sessionStorage') });
  const resumed = app.resume();
  const plan = bootPlan(resumed);
  if ('reason' in resumed) {
    const kept = plan === 'protect' ? app.protectUnreadable() : null;
    app.newEvent();
    if (kept?.kept) ui.set({ flash: unreadableFlash(resumed.reason, kept) });
  } else if (plan === 'resume') ui.set({ flash: resumeFlash(resumed.event, browserClock()) });
  else app.newEvent();
  const displayUrl = `${location.pathname}${location.search}#/display`;
  /** @type {ReturnType<typeof mountHost> | null} */
  let mounted = null;
  let ready = false;

  // Judge Mode's lock, in localStorage so every host window honours the Host PIN.
  /** @type {string|null} */
  let lockText = null;
  const readLock = () => {
    try {
      return local?.getItem(JUDGE_LOCK_KEY) ?? null;
    } catch {
      return null;
    }
  };
  const syncLock = () => {
    if (!app.isActive()) return;
    const want = judgeLockText(ui.get(), app.getEvent());
    if (want === lockText) return;
    lockText = want;
    try {
      if (want === null) local?.removeItem(JUDGE_LOCK_KEY);
      else local?.setItem(JUDGE_LOCK_KEY, want);
    } catch {
      // (no storage: the lock lives only in this tab)
    }
  };
  const testPattern = () => link.post({ type: 'testPattern', show: !!ui.get().local.shell?.testPattern });
  /** This window holds the event (at boot, or after Take Over): reopen a locked Judge Mode, tell the display. @param {boolean} on */
  const activate = (on) => {
    const was = app.isActive();
    app.setActive(on);
    if (!on || was) return;
    lockText = readLock();
    const locked = judgeLockPatch(ui.get(), lockText, app.getEvent());
    if (locked) ui.set(locked);
    syncLock();
    testPattern();
  };
  const offLockApp = app.subscribe(syncLock);
  const offLockUi = ui.subscribe(syncLock);

  const link = createHostLink({
    channel,
    windowId: newId('win'),
    clock: browserClock,
    onHello: () => {
      if (!app.isActive()) return;
      app.broadcast();
      // A display that reloads, or a host that took over, always says whether the test pattern is up.
      testPattern();
    },
    onChange: (status) => {
      if (ready) activate(status.active);
      mounted?.linkChanged();
    },
  });
  mounted = mountHost(root, {
    app,
    ui,
    link,
    clock: browserClock,
    openDisplay: () => {
      const win = window.open(displayUrl, 'larp-display', 'popup,width=1280,height=720');
      if (!win) ui.set({ flash: { kind: 'error', key: 'hint.popupBlocked' } });
    },
  });
  link.start();
  // An older host window answers hostHello at once; only then may this one save and post.
  const wait = setTimeout(() => {
    ready = true;
    activate(link.status().active);
  }, HELLO_WAIT_MS);
  return {
    destroy() {
      clearTimeout(wait);
      offLockApp();
      offLockUi();
      link.close();
      mounted?.destroy();
      channel.close();
    },
  };
}
