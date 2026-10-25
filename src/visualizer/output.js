// Bonfire Live's output window: just the picture, for a projector (src/ui/output.js streams
// the canvas into it). The title card, which is drawn over the canvas rather than in it, is
// copied across as it comes and goes.
import { q } from '../ui/shell.js';
import { createOutputWindow } from '../ui/output.js';

/**
 * The output window's part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createOutput(ctx) {
  const titleCard = q('[data-title-card]'); // (cards.js shows it here; it's copied there)
  const win = createOutputWindow({
    stage: q('[data-stage]'),
    name: 'bonfire-output',
    title: 'Bonfire Live — Output',
    note: (text, seconds) => ctx.note(text, seconds),
    onChange: (open) => {
      q('[data-output-label]').textContent = open ? 'Output (open)' : 'Output';
    },
  });
  /** Copies the title card (and the flame colors and dither tiles it draws with) into the output window. */
  const mirrorCard = () => win.mirror(titleCard, 'card');
  function openOutput() {
    if (win.open()) mirrorCard();
  }

  return { openOutput, mirrorCard, streamOutput: win.stream };
}
