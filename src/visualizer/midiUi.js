// Bonfire Live's MIDI controller: pads for the moments (the drop, a ring, the next scene…),
// each mapped by learning (press Learn, then the pad), listed in the settings with the pad
// each one has (midi.js keeps the mapping in this browser). A pad plays only while the music
// does.
import { q } from '../ui/shell.js';
import { MIDI_ACTIONS, createMidi } from './midi.js';
import { esc } from '../html.js';

/**
 * The MIDI controller's part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createMidiUi(ctx) {
  const settingsDialog = q('[data-settings]');

  const midiList = q('[data-midi-list]');
  const midiStatus = q('[data-midi-status]');
  // (The X moment is the Living Weapon everywhere people read it.)
  const MIDI_NAMES = { ...MIDI_ACTIONS, combo: 'Living Weapon' };
  function drawMidi() {
    const map = midi.mapping;
    midiList.innerHTML = Object.entries(MIDI_NAMES).map(([id, name]) => `
      <li data-row="midi:${id}"><span data-name>${esc(name)}</span><span class="viz-midi-key">${esc(map[id] ?? '—')}</span>
        <button class="pix-btn" type="button" data-midi-learn="${id}"${midi.connected ? '' : ' disabled'} aria-label="Learn ${esc(name)}">Learn</button>
        ${map[id] ? `<button class="pix-btn" type="button" data-midi-forget="${id}" aria-label="Forget ${esc(name)}" data-tip="Forget this pad">✕</button>` : ''}</li>`).join('');
  }
  const midiActions = {
    drop: () => ctx.actions.drop(), arm: () => ctx.actions.arm(), ring: () => ctx.actions.ring(), combo: () => ctx.actions.combo(),
    cut: () => ctx.actions.cut(), look: () => ctx.note(`Look: ${ctx.director?.nextLook()}`, 1.5), scene: () => ctx.nextScene(), burst: () => ctx.director?.glitchHit(),
    fire: () => ctx.director?.hit({ element: 'fire' }), lightning: () => ctx.director?.hit({ element: 'lightning' }), ice: () => ctx.director?.hit({ element: 'ice' }),
    record: () => ctx.actions.record(),
    knightsDance: () => ctx.actions.dance(), knights: () => ctx.actions.knights(),
  };
  const midi = createMidi({
    onAction: (id) => { if (document.body.dataset.mode === 'live' && ctx.fire) { midiActions[id]?.(); ctx.wake(); } },
    onStatus: (text) => { midiStatus.textContent = text; },
    onChange: drawMidi,
  });
  drawMidi();
  settingsDialog.addEventListener('click', async (e) => {
    if (e.target.closest('[data-midi-connect]')) { if (await midi.connect()) drawMidi(); return; }
    const learn = e.target.closest('[data-midi-learn]');
    if (learn) { midi.learn(learn.dataset.midiLearn); return; }
    const forget = e.target.closest('[data-midi-forget]');
    if (forget) midi.forget(forget.dataset.midiForget);
  });

  return { midiNames: MIDI_NAMES };
}
