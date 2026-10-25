// An output window: just the picture, for a projector (Bonfire Live, the campfire game). The
// stage's canvas is streamed into a second window (so it can go full screen on another
// display) while this one keeps the controls. What's drawn over the canvas as HTML (a title
// card, a scoreboard) isn't in the stream, so the page copies each such element across as it
// changes: mirror(el) puts a fresh copy of `el` there (a fresh node restarts its CSS
// animation), in its place among the others by its `data-mirror` name, with the page's styles,
// flame colors and dither tiles.
//
//   createOutputWindow({ stage, name, title, note, onChange }) → { open, mirror, stream, isOpen }
//     stage     the element holding the scene's canvas
//     name      the window's name (window.open: one per page)
//     note      tells the operator something (the window was blocked, it's open)
//     onChange  (open) when the window opens or closes
//     stream()  a rebuilt scene has a canvas of its own: the open window streams it now

/**
 * @param {{ stage: Element, name: string, title: string, note?: (text: string, seconds?: number) => void,
 *   onChange?: (open: boolean) => void, hint?: string }} o
 */
export function createOutputWindow({
  stage,
  name,
  title,
  note = () => {},
  onChange = () => {},
  hint = 'Drag this window to the projector, then double-click for full screen.',
}) {
  /** @type {Window | null} */
  let output = null;
  const isOpen = () => !!output && !output.closed;

  /** @param {Window} win */
  function streamInto(win) {
    const canvas = stage.querySelector('canvas');
    const video = win.document.querySelector('video');
    if (!canvas?.captureStream || !video) return false;
    /** @type {MediaStream|null} */ (video.srcObject)?.getTracks().forEach((t) => t.stop());
    video.srcObject = canvas.captureStream(60);
    return true;
  }
  function stream() {
    if (output && isOpen()) streamInto(output);
  }

  /**
   * Copies `el` (and the flame colors and dither tiles it draws with) into the output window,
   * replacing the copy of the same `data-mirror` name (`key` when it has none).
   * @param {Element} el
   * @param {string} [key]
   */
  function mirror(el, key = /** @type {HTMLElement} */ (el).dataset?.mirror ?? 'card') {
    if (!output || !isOpen()) return;
    const doc = output.document;
    Object.assign(doc.documentElement.dataset, document.documentElement.dataset);
    doc.documentElement.style.cssText = document.documentElement.style.cssText;
    const copy = /** @type {HTMLElement} */ (doc.importNode(el, true));
    copy.dataset.mirror = key;
    const old = [...doc.querySelectorAll('[data-mirror]')].find(
      (n) => /** @type {HTMLElement} */ (n).dataset.mirror === key,
    );
    if (old) old.replaceWith(copy);
    else doc.body.append(copy);
  }

  /** Opens the window (or brings it forward); false if it couldn't. */
  function open() {
    if (output && isOpen()) {
      output.focus();
      return true;
    }
    if (!stage.querySelector('canvas')?.captureStream) {
      note('This browser can’t send the picture to another window', 3);
      return false;
    }
    output = window.open('', name, 'popup,width=1280,height=720');
    if (!output) {
      note('The window was blocked: allow pop-ups for this page', 3);
      return false;
    }
    const win = output;
    win.document.title = title;
    // The page's styles come along so what's mirrored (HTML over the canvas, not in the
    // stream) looks the same there.
    win.document.head.replaceChildren(
      ...[...document.querySelectorAll('link[rel="stylesheet"], style')].map((el) => {
        if (el.tagName !== 'LINK') return el.cloneNode(true);
        const link = win.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = /** @type {HTMLLinkElement} */ (el).href;
        return link;
      }),
    );
    win.document.body.innerHTML = `
      <style>
        html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
        video { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
        .viz-out-hint { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); margin: 0; padding: 6px 12px;
            font: 14px system-ui, sans-serif; color: #e9e3d2; background: #07070bcc; transition: opacity 600ms; z-index: 99; }
        body.quiet .viz-out-hint { opacity: 0; } body.quiet { cursor: none; }
      </style>
      <video autoplay muted playsinline></video>
      <p class="viz-out-hint"></p>`;
    const doc = win.document;
    /** @type {HTMLElement} */ (doc.querySelector('.viz-out-hint')).textContent = hint;
    doc.addEventListener('dblclick', () =>
      doc.fullscreenElement ? doc.exitFullscreen() : doc.documentElement.requestFullscreen?.(),
    );
    let quiet = 0;
    const wakeOut = () => {
      doc.body.classList.remove('quiet');
      clearTimeout(quiet);
      quiet = win.setTimeout(() => doc.body.classList.add('quiet'), 2500);
    };
    doc.addEventListener('pointermove', wakeOut);
    wakeOut();
    streamInto(win);
    win.addEventListener('pagehide', () => onChange(false));
    onChange(true);
    note('Output window open', 2);
    return true;
  }

  return { open, mirror, stream, isOpen };
}
