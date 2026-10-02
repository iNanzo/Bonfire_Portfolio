// Bonfire Live's output window: just the picture, for a projector. The canvas is streamed
// into a second window (so it can go full screen on another display) while this one keeps
// the controls; the title card, which is drawn over the canvas rather than in it, is copied
// across as it comes and goes.
import { q } from '../ui/shell.js';

/**
 * The output window's part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createOutput(ctx) {
  const stage = q('[data-stage]');

  const titleCard = q('[data-title-card]'); // (cards.js shows it here; it's copied there)
  let output = null;
  function streamInto(win) {
    const canvas = stage.querySelector('canvas');
    const video = win.document.querySelector('video');
    if (!canvas?.captureStream || !video) return false;
    video.srcObject?.getTracks().forEach((t) => t.stop());
    video.srcObject = canvas.captureStream(60);
    return true;
  }
  /** A rebuilt scene has a canvas of its own: the output window, if it's open, streams it now. */
  function streamOutput() {
    if (output && !output.closed) streamInto(output);
  }
  /** Copies the title card (and the flame colors and dither tiles it draws with) into the output window. */
  function mirrorCard() {
    if (!output || output.closed) return;
    const doc = output.document;
    Object.assign(doc.documentElement.dataset, document.documentElement.dataset);
    doc.documentElement.style.cssText = document.documentElement.style.cssText;
    const copy = doc.importNode(titleCard, true); // a fresh node restarts the fade-in
    const old = doc.querySelector('[data-title-card]');
    if (old) old.replaceWith(copy); else doc.body.append(copy);
  }
  function openOutput() {
    if (output && !output.closed) { output.focus(); return; }
    if (!stage.querySelector('canvas')?.captureStream) { ctx.note('This browser can’t send the picture to another window', 3); return; }
    output = window.open('', 'bonfire-output', 'popup,width=1280,height=720');
    if (!output) { ctx.note('The window was blocked: allow pop-ups for this page', 3); return; }
    output.document.title = 'Bonfire Live — Output';
    // The page's styles come along so the title card (HTML over the canvas, not in the stream)
    // looks the same there.
    output.document.head.replaceChildren(...[...document.querySelectorAll('link[rel="stylesheet"], style')].map((el) => {
      if (el.tagName !== 'LINK') return el.cloneNode(true);
      const link = output.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = el.href;
      return link;
    }));
    output.document.body.innerHTML = `
      <style>
        html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
        video { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
        .viz-out-hint { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); margin: 0; padding: 6px 12px;
            font: 14px system-ui, sans-serif; color: #e9e3d2; background: #07070bcc; transition: opacity 600ms; }
        body.quiet .viz-out-hint { opacity: 0; } body.quiet { cursor: none; }
      </style>
      <video autoplay muted playsinline></video>
      <p class="viz-out-hint">Drag this window to the projector, then double-click for full screen.</p>`;
    const doc = output.document;
    doc.addEventListener('dblclick', () => (doc.fullscreenElement ? doc.exitFullscreen() : doc.documentElement.requestFullscreen?.()));
    let quiet = 0;
    const wakeOut = () => { doc.body.classList.remove('quiet'); clearTimeout(quiet); quiet = setTimeout(() => doc.body.classList.add('quiet'), 2500); };
    doc.addEventListener('pointermove', wakeOut);
    wakeOut();
    streamInto(output);
    mirrorCard();
    output.addEventListener('pagehide', () => { q('[data-output-label]').textContent = 'Output'; });
    q('[data-output-label]').textContent = 'Output (open)';
    ctx.note('Output window open', 2);
  }

  return { openOutput, mirrorCard, streamOutput };
}
