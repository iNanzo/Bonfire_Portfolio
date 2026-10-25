// Lửa Trại Nghĩa Sĩ (/larp/): one page for both windows, routed by hash like the site.
//   #/host (the default)  the host console on the laptop (hostDom.js startHost): the one true
//                         event (app.js), saved after every command, its public projection
//                         posted to the display
//   #/display             the projector window (displayDom.js startDisplay): renders only what
//                         the host posts (channel.js)
// Each window loads only its own code (import()); the host never loads three.js. Design:
// docs/design/nghia-si-campfire.md (UI/UX, Architecture).
import './css/index.css';
import { route } from './browser.js';

const root = /** @type {HTMLElement} */ (document.getElementById('larp'));
const which = route(location.hash);
document.body.classList.add(`larp-${which}`);
root.textContent = '';

/** @type {Promise<{ destroy(): void }>} */
const started =
  which === 'display'
    ? import('./displayDom.js').then((m) => m.startDisplay(root))
    : import('./hostDom.js').then((m) => m.startHost(root));

// Switching the hash by hand (#/host ⇄ #/display) reloads into the other window's role.
addEventListener('hashchange', () => {
  if (route(location.hash) !== which) location.reload();
});
addEventListener('pagehide', () => started.then((s) => s.destroy()));
