// A MIDI controller for Bonfire Live (Web MIDI): pads and buttons trigger the moments a
// performer wants by hand (the drop, a forge, a ring, a swing, a cut, a look, the next
// preset scene, a hit in an element, recording, the knights dancing or coming and going). Mapping is by "learn":
// pick an action, press a pad, done. The mapping belongs to this computer and its
// controller, so it's kept apart from the settings and setups (localStorage
// 'bonfire-live-midi').
//
// A note-on (velocity > 0) is a press; so is a control change crossing up past 63 (a
// button sending 127 then 0, or a knob turned past halfway). Everything else is ignored.

export const MIDI_ACTIONS = {
  drop: 'Drop',
  arm: 'Forge / Strike',
  ring: 'Ring',
  combo: 'Swing',
  cut: 'Next Shot',
  look: 'Next Look',
  scene: 'Next Scene',
  burst: 'Look Burst',
  fire: 'Hit: Flame',
  lightning: 'Hit: Lightning',
  ice: 'Hit: Frost',
  record: 'Record',
  knightsDance: 'Knights Dance',
  knights: 'Knights In / Out',
};

const STORE = 'bonfire-live-midi';

/**
 * A MIDI message as a control: { key ('note:<ch>:<n>' | 'cc:<ch>:<n>'), value 0..127 }, or
 * null for anything that isn't a note-on, note-off or control change. Channels are 1..16.
 */
export function parseMidi(data) {
  if (!data || data.length < 3) return null;
  const type = data[0] & 0xf0;
  const ch = (data[0] & 0x0f) + 1;
  if (type === 0x90) return { key: `note:${ch}:${data[1]}`, value: data[2] };
  if (type === 0x80) return { key: `note:${ch}:${data[1]}`, value: 0 };
  if (type === 0xb0) return { key: `cc:${ch}:${data[1]}`, value: data[2] };
  return null;
}

/** A control's name for people: "Note 36 · Ch 10", "CC 64 · Ch 1". */
export function controlName(key) {
  const [kind, ch, n] = String(key).split(':');
  return kind === 'note' ? `Note ${n} · Ch ${ch}` : kind === 'cc' ? `CC ${n} · Ch ${ch}` : '';
}

/**
 * Presses from a stream of controls: a note-on, or a CC crossing up past 63.
 * Returns a function taking a parsed message and saying whether it's a press.
 */
export function pressDetector() {
  const high = new Map();
  return (msg) => {
    if (!msg) return false;
    if (msg.key.startsWith('note:')) return msg.value > 0;
    const was = high.get(msg.key) ?? false;
    const is = msg.value > 63;
    high.set(msg.key, is);
    return is && !was;
  };
}

/**
 * @param {object} o
 * @param {(action: string) => void} o.onAction
 * @param {(text: string) => void} o.onStatus   a line about the connection or the learning
 * @param {() => void} [o.onChange]             the mapping changed (redraw it)
 */
export function createMidi({ onAction, onStatus, onChange = () => {} }) {
  /** @type {Record<string, string>} action → control key */
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(STORE) ?? '{}') ?? {};
  } catch {
    /* storage off */
  }
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(map));
    } catch {
      /* storage off */
    }
  };
  const isPress = pressDetector();
  let access = null;
  let learning = null;

  function listen() {
    for (const input of access.inputs.values()) input.onmidimessage = (e) => receive(parseMidi(e.data));
    const names = [...access.inputs.values()].map((i) => i.name).filter(Boolean);
    onStatus(names.length ? `Connected: ${names.join(', ')}` : 'No MIDI controller found. Plug one in.');
  }
  function receive(msg) {
    if (!isPress(msg)) return;
    if (learning) {
      for (const [a, k] of Object.entries(map)) if (k === msg.key) delete map[a]; // (one action per control)
      map[learning] = msg.key;
      onStatus(`${MIDI_ACTIONS[learning]}: ${controlName(msg.key)}`);
      learning = null;
      save();
      onChange();
      return;
    }
    const action = Object.keys(map).find((a) => map[a] === msg.key);
    if (action) onAction(action);
  }

  return {
    get connected() {
      return !!access;
    },
    /** Ask for MIDI (the browser asks the user the first time). */
    async connect() {
      if (!navigator.requestMIDIAccess) {
        onStatus('This browser has no MIDI. Try Chrome or Edge.');
        return false;
      }
      try {
        access = await navigator.requestMIDIAccess();
        access.onstatechange = listen;
        listen();
        return true;
      } catch {
        onStatus('MIDI wasn’t allowed. Allow it in the address bar’s site settings.');
        return false;
      }
    },
    /** The next pad or button pressed controls `action`. */
    learn(action) {
      if (!MIDI_ACTIONS[action]) return;
      learning = action;
      onStatus(`Press a pad or button for ${MIDI_ACTIONS[action]}…`);
    },
    forget(action) {
      delete map[action];
      save();
      onChange();
    },
    /** action → the control's name, for the list. */
    get mapping() {
      return Object.fromEntries(Object.entries(map).map(([a, k]) => [a, controlName(k)]));
    },
  };
}
