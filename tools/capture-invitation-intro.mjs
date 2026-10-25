// The intro act for tools/capture-invitation.mjs (its header lists it: intro): Replay Intro
// played through as a visitor would, at real speed, with real taps or clicks: each line left to
// type (one finished early with a tap), read for a moment, then tapped on; at a question, a pause
// and the reply on the way to an ending (e2e/helpers/dialogue-route.mjs routeToEnd, so it reaches
// the end of any intro rather than looping on the same reply); the Log opened partway, read and
// closed; on to the end, when the camera eases back and the toolbar returns. It takes the capture
// tool's own helpers (introActs).
import { routeToEnd } from '../e2e/helpers/dialogue-route.mjs';

/**
 * The acts, given the capture tool's helpers: `tapAt(page, size, p)` (a touch on a phone size, a
 * click on a desktop one) and `sleep(ms)`.
 * @param {{tapAt: Function, sleep: (ms: number) => Promise<void>}} kit
 */
export function introActs({ tapAt, sleep }) {
  const snap = (page) => page.evaluate(() => window.__invitation.snapshot());
  /** The middle of what `sel` matches, client px. */
  const centre = async (page, sel) => {
    const b = await page.locator(sel).first().boundingBox();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  };
  /** Waits until the line up is typed (or the intro's over), up to `ms`. */
  async function typed(page, ms = 9000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await snap(page);
      if (!s.dialogue || s.dialogue.typed) return s;
      await sleep(80);
    }
    return snap(page);
  }
  /**
   * Replay Intro, played through: at each question, the reply on the shortest way to an ending
   * (routeToEnd of the script the page runs).
   */
  async function playIntro(page, size) {
    const at = await centre(page, '[data-intro]');
    if (!at) return false;
    const route = routeToEnd(await page.evaluate(() => window.__invitation.intro()));
    await tapAt(page, size, at);
    // (It opens on the page's next frame.)
    for (let i = 0; i < 50 && !(await snap(page)).dialogue; i++) await sleep(40);
    const goOn = { x: size.w * 0.18, y: size.h * 0.3 };
    let shown = 0;
    let logged = false;
    for (let i = 0; i < 40; i++) {
      let s = await snap(page);
      if (!s.dialogue) break;
      shown++;
      if (shown === 2 && !s.dialogue.typed) {
        // (A line finished early with a tap.)
        await sleep(450);
        await tapAt(page, size, goOn);
      }
      s = await typed(page);
      if (!s.dialogue) break;
      if (s.dialogue.choices) {
        await sleep(1600);
        // (The reply that leads on along the route; the first if this box is off it.)
        const next = route[route.indexOf(s.dialogue.id) + 1];
        const pick = Math.max(0, s.dialogue.choices.indexOf(next));
        const p = await centre(page, `.inv-talk-choice >> nth=${pick}`);
        if (p) await tapAt(page, size, p);
        await sleep(300);
        continue;
      }
      await sleep(900 + 30 * s.dialogue.length);
      if (shown === 4 && !logged) {
        logged = true;
        const log = await centre(page, '[data-talk="log"]');
        if (log) {
          await tapAt(page, size, log);
          await sleep(2600);
          const close = await centre(page, '[data-talk="log-close"]');
          if (close) await tapAt(page, size, close);
          await sleep(700);
        }
      }
      await tapAt(page, size, goOn);
      await sleep(120);
    }
    // (The camera easing back, the toolbar returning.)
    await sleep(1800);
    return true;
  }
  return { playIntro };
}
