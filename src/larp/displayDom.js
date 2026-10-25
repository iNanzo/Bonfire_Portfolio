// The display window's DOM: it joins the channel, says hello (the host answers with the current
// projection), renders displayVm/renderDisplay on every projection and status change and once a
// second (the timer, the pages), posts its heartbeat, and says bye when destroyed (main.js does
// that on pagehide). Behind the panels: the bonfire (stage.js createStage, three.js loaded lazily
// with import()), over a still that stays when WebGL fails: the build's og/home.jpg, dimmed, or a
// gradient where there is none. Only a zone whose key changed is replaced (and replays its
// entrance); the others are updated in place. Every decision is in display.js / displayView.js.
import { CHANNEL_NAME, HEARTBEAT_MS, createChannel, createDisplayLink } from './channel.js';
import { displayActions, displayVm, pageKeyOf, renderDisplay } from './display.js';
import { trackSince } from './displayView.js';
import { createStage } from './stage.js';
import { warmFonts } from './fonts.js';
import { bind } from './dom.js';
import { clock as browserClock, newId } from './browser.js';
import { toggleFullscreen } from '../ui/shell.js';
import { applyFlame } from '../ui/theme.js';
import { flameOr } from '../palette.js';

/**
 * Puts `html` (a .larp-display-zones root) into `host`, replacing only the zones whose data-key
 * changed and updating the rest in place, so an entrance plays once per new thing.
 * @param {HTMLElement} host
 * @param {string} html
 */
export function patchZones(host, html) {
  const tpl = host.ownerDocument.createElement('template');
  tpl.innerHTML = html;
  const next = /** @type {HTMLElement|null} */ (tpl.content.firstElementChild);
  const cur = /** @type {HTMLElement|null} */ (host.firstElementChild);
  if (!next || !cur || cur.className !== next.className) return void host.replaceChildren(tpl.content);
  for (const a of [...cur.attributes]) if (!next.hasAttribute(a.name)) cur.removeAttribute(a.name);
  for (const a of [...next.attributes]) if (cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value);
  const old = new Map([...cur.children].map((el) => [/** @type {HTMLElement} */ (el).dataset.zone, el]));
  for (const el of /** @type {HTMLElement[]} */ ([...next.children])) {
    const prev = /** @type {HTMLElement|undefined} */ (old.get(el.dataset.zone));
    old.delete(el.dataset.zone);
    if (!prev) cur.append(el);
    else if (prev.dataset.key !== el.dataset.key) prev.replaceWith(el);
    else if (prev.innerHTML !== el.innerHTML) prev.innerHTML = el.innerHTML;
  }
  for (const el of old.values()) el.remove();
}

/**
 * Shows the build's still of the bonfire (og/home.jpg) when it loads; the CSS gradient stays
 * otherwise (a dev server has none).
 * @param {HTMLElement} still
 */
function showStill(still) {
  const src = `${import.meta.env?.BASE_URL ?? '/'}og/home.jpg`;
  const img = new Image();
  img.onload = () => still.style.setProperty('--still', `url("${src}")`);
  img.src = src;
}

/**
 * @param {HTMLElement} root
 * @param {{ clock: () => number, windowId: string, BroadcastChannelImpl?: any }} deps
 * @returns {{ destroy(): void }}
 */
export function mountDisplay(root, { clock, windowId, BroadcastChannelImpl }) {
  const doc = root.ownerDocument;
  root.classList.add('larp-display');
  root.innerHTML =
    '<div class="larp-display-still" data-layer="still"></div><div class="larp-display-stage" data-layer="stage"></div><div class="larp-display-overlay" data-layer="overlay"></div>';
  const [still, stageEl, overlay] = /** @type {HTMLElement[]} */ (
    ['still', 'stage', 'overlay'].map((l) => root.querySelector(`[data-layer="${l}"]`))
  );
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = createStage({
    container: stageEl,
    reducedMotion: reduced,
    onFail: () => {
      root.dataset.webgl = 'off';
      link.setWebgl(false);
      showStill(still);
    },
    // data-stage: 'scene' once the bonfire draws, 'knights' once everything it loads is in.
    onReady: (what) => (root.dataset.stage = what),
  });
  const channel = createChannel({ name: CHANNEL_NAME, BroadcastChannelImpl });
  /** @type {{ key: string|null, since: number }|null} */
  let paging = null;
  let flame = '';
  let received = 0;
  /** @type {import('./types.js').Projection|null} */
  let shown = null;

  const render = () => {
    const s = link.state();
    const now = clock();
    if (s.received !== received) {
      received = s.received;
      stage.apply(s.projection, shown);
      shown = s.projection;
    }
    paging = trackSince(paging, pageKeyOf(s.projection, s.testPattern), now);
    const vm = displayVm(s.projection, {
      now,
      hostClosed: link.status().hostClosed,
      testPattern: s.testPattern,
      since: paging.since,
    });
    patchZones(overlay, renderDisplay(vm));
    doc.documentElement.lang = vm.lang;
    root.dataset.fullscreen = String(!!doc.fullscreenElement);
    if (vm.flame !== flame) {
      try {
        applyFlame(flameOr((flame = vm.flame)));
      } catch {
        // (no flames in the palette: the default accents stay)
      }
    }
  };
  const link = createDisplayLink({ channel, windowId, clock, onChange: render });
  const handlers = displayActions({
    fullscreen: () => toggleFullscreen(doc.documentElement),
    close: () => window.close(),
  });
  const unbind = bind(overlay, () => handlers);
  const timer = setInterval(() => {
    if (!stage.failed && stageEl.querySelector('canvas')) link.setWebgl(true);
    link.tick();
    render();
  }, HEARTBEAT_MS);
  doc.addEventListener('fullscreenchange', render);
  render();
  link.start();
  return {
    destroy() {
      clearInterval(timer);
      doc.removeEventListener('fullscreenchange', render);
      unbind();
      stage.dispose();
      link.close();
      channel.close();
    },
  };
}

/**
 * The display window, on the laptop's clock.
 * @param {HTMLElement} root
 */
export function startDisplay(root) {
  void warmFonts(document.fonts); // every face now, while the network is there (U11)
  return mountDisplay(root, { clock: browserClock, windowId: newId('win') });
}
