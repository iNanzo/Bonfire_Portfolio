// The letter machines have one owner. Renderer bindings consume views and petal commands.
import { createEnvelope, TIMES, BOB } from '../../invitation/envelope.js';
import { PAGES } from './pages.js';
// The real rig's hair and tilted paper need this gap: 1.05m still overlaps their projected bounds.
const LETTER_HANG = 1.1;
export function createNewtMoments({
  onImpact = (..._args) => {},
  settings = { page: 'dusk', pageTurns: 'drops' },
  reduced = false,
} = {}) {
  let t = 0,
    nextId = 0,
    active = null,
    currentPage = settings.page ?? 'dusk',
    turn = null,
    beatAt = null;
  let features = {},
    commands = [];
  const letters = [];
  const cues = createCues(reduced);
  let releasedNow = false,
    cancelledNow = false;
  const equipment = { weapon: 'longsword', flame: 'ember', element: 'fire' };
  const emit = (kind, letter) => commands.push({ kind, id: letter.id });
  function make(kind, extra = {}) {
    const letter = {
      id: ++nextId,
      kind,
      born: t,
      time: t,
      pace: 1,
      scale: kind === 'quick' ? 0.6 : 1,
      stage: 0,
      ready: false,
      released: false,
      releasePending: false,
      bigDrop: false,
      impacted: false,
      cancelled: false,
      dismissed: false,
      skipping: false,
      openedAt: null,
      resolve: null,
      selection: null,
      from: equipment.flame,
      env: createEnvelope({ born: t, reduced }),
      ...extra,
    };
    letters.push(letter);
    emit('spawn', letter);
    return letter;
  }
  function open(letter, at = letter.time) {
    if (letter.env.open(at)) {
      letter.openedAt = at;
      emit('bloom', letter);
    }
  }
  function apply(letter) {
    if (letter.impacted || letter.cancelled || !letter.selection) return;
    letter.impacted = true;
    Object.assign(equipment, letter.selection);
    if (letter.bigDrop && !letter.dismissed && settings.pageTurns === 'drops') {
      const keys = Object.keys(PAGES),
        from = currentPage;
      currentPage = keys[(keys.indexOf(currentPage) + 1) % keys.length];
      turn = { from, to: currentPage, at: t };
    }
    if (active === letter) active = null;
    onImpact(letter.selection.flame, letter.from, false, letter.selection);
    letter.resolve?.({ status: 'applied' });
  }
  function skip(letter, cancelled = false) {
    if (!letter) return;
    const skipped = letter.env.skip(letter.time);
    if (skipped) emit('spill', letter);
    if (cancelled) {
      cancelledNow = true;
      letter.cancelled = true;
      letter.bigDrop = false;
      letter.resolve?.({ status: 'cancelled' });
      if (active === letter) active = null;
    } else if (skipped) letter.skipping = true;
  }
  return {
    equipment,
    get page() {
      return currentPage;
    },
    setPage(key) {
      currentPage = PAGES[key] ? key : 'dusk';
      turn = null;
    },
    get holding() {
      return !!active?.hold && !active.released;
    },
    get forging() {
      return !!active;
    },
    equip(selection, options = {}) {
      const instant = !!options.instant || selection.weapon === equipment.weapon;
      if (instant) {
        skip(active, true);
        Object.assign(equipment, selection);
        onImpact(selection.flame, selection.flame, true, selection);
        return Promise.resolve({ status: 'applied' });
      }
      if (active) return Promise.resolve({ status: 'cancelled' });
      equipment.weapon = selection.weapon;
      equipment.element = selection.element;
      active = make(options.hold ? 'held' : 'quick', {
        hold: !!options.hold,
        pace: options.hold ? 1 : (options.pace ?? 1),
        selection,
      });
      return new Promise((resolve) => {
        active.resolve = resolve;
      });
    },
    release() {
      if (!active?.hold || active.released) return false;
      releasedNow = true;
      active.released = true;
      active.releasePending = true;
      if (active.dismissed) skip(active);
      else {
        active.ready = true;
        open(active);
      }
      return true;
    },
    /** @param {{t:number, f?:Record<string, any>, events?:any[], newt?:any}} input */
    step({
      t: now,
      f = {},
      events = [],
      newt = { state: 'idle', grounded: true, x: 0, z: 0, collar: { x: 0, y: 0.78, z: 0 }, showing: false },
    }) {
      t = now;
      features = f;
      const beat = f.beats?.at(-1);
      if (beat) beatAt = t - (Number.isFinite(f.time) && Number.isFinite(beat.time) ? f.time - beat.time : 0);
      for (const letter of letters) letter.time = letter.born + (t - letter.born) * letter.pace;
      if (f.events?.includes('start')) {
        const waiting = letters.find((l) => l.kind === 'end' && l.env.state === 'floating');
        if (waiting) {
          waiting.kind = 'start';
          waiting.startedAt = t;
        } else make('start', { startedAt: t });
      }
      if (f.events?.includes('return') && active) {
        active.dismissed = true;
        if (active.released) skip(active);
      }
      if (f.events?.includes('silence')) {
        commands.push({ kind: 'cut', id: null });
        for (const letter of letters) skip(letter, true);
        make('end');
      }
      const stage = Math.max(
        0,
        ...events.filter((e) => e.type === 'stage').map((e) => e.data.stage ?? 0),
        f.build >= 0.9 ? 4 : 0,
      );
      if (active?.hold) {
        if (!reduced && active.stage < 3 && stage >= 3) emit('ring', active);
        active.stage = Math.max(active.stage, stage);
        if (active.stage >= 4) open(active);
        if ((!active.released || active.releasePending) && f.events?.includes('drop') && f.drop === 'big')
          active.bigDrop = true;
        active.releasePending = false;
      }
      const downbeat = f.locked && f.beats?.some((b) => b.beat === 0);
      for (const letter of letters) {
        if (letter.kind === 'quick' && letter.openedAt === null && letter.time - letter.born >= TIMES.arrive) {
          open(letter, letter.born + TIMES.arrive);
        }
        if (letter.kind === 'quick' && letter.time - letter.born >= TIMES.arrive + TIMES.opening) letter.ready = true;
        if (letter.kind === 'start') {
          if (letter.openedAt === null && (downbeat || (!f.locked && t - letter.startedAt >= 4))) open(letter);
          else if (
            letter.openedAt !== null &&
            letter.time - letter.openedAt >= TIMES.opening &&
            (downbeat || !f.locked)
          )
            letter.ready = true;
        }
        const before = letter.env.state;
        const state = letter.env.step(letter.time, letter.ready);
        if (state === 'fading' && before !== 'fading') {
          if (letter.kind === 'start') cues.wave();
          apply(letter);
        }
        if (letter.skipping && letter.env.done(letter.time)) apply(letter);
      }
      const actions = cues.step({
        t,
        f,
        events,
        newt,
        stage: Math.max(stage, f.build >= 0.75 ? 3 : f.build >= 0.5 ? 2 : 0),
        holding: !!active?.hold && !active.released,
        released: releasedNow,
        cancelled: cancelledNow,
      });
      releasedNow = cancelledNow = false;
      if (active?.hold && cues.position) active.position = { ...cues.position };
      const views = letters
        .filter((l) => !l.env.done(l.time))
        .map((l) => {
          const pose = l.env.pose(l.time);
          if (l.kind === 'held' && l.env.state === 'floating') {
            if (!reduced) {
              const lift = features.build ?? l.stage / 4;
              pose.push += 0.18 * lift;
              if (l.stage >= 3) pose.bloom = Math.max(pose.bloom, (lift * 0.14) / 0.45);
              if (features.locked && features.bpm > 0 && beatAt !== null)
                pose.bob = BOB * Math.sin((2 * Math.PI * (t - beatAt)) / (60 / features.bpm));
            }
          }
          return {
            id: l.id,
            kind: l.kind,
            state: l.env.state,
            scale: l.scale,
            pose,
            time: l.time,
            ...(l.kind === 'held' && l.position
              ? l.position
              : { x: l.kind === 'quick' ? 0.9 : 0, y: l.kind === 'quick' ? 0.35 : 1.35, z: 0 }),
          };
        });
      for (let i = letters.length - 1; i >= 0; i--) if (letters[i].env.done(letters[i].time)) letters.splice(i, 1);
      const page = turn ? { ...turn, k: Math.min(1, (t - turn.at) / TIMES.clear) } : null;
      if (page?.k === 1) turn = null;
      const result = { letters: views, petals: commands, page, ...actions };
      commands = [];
      return result;
    },
    dispose() {
      for (const l of letters) l.resolve?.({ status: 'cancelled' });
      letters.length = 0;
      active = null;
      commands = [];
    },
  };
}

// Intent queues keep toggle buttons on separate frames and discard them off the floor.
function createCues(reduced) {
  const sitting = new Set(['sitDown', 'sit', 'deviceSit']);
  const lying = new Set(['lieDown', 'deviceLie', 'getUp']);
  let queue = [],
    stageMax = 0,
    wasLow = false,
    deviceDone = false,
    silent = false,
    silentPresses = 0,
    grab = null,
    position = null;
  const gesture = (type, t, on = 'newt') => ({
    type,
    on,
    x: 0,
    y: 0,
    t,
    ...(on === 'floor' ? { floor: { x: 0, z: 0 } } : {}),
  });
  function sections({ f, events, holding, stage }) {
    const low = f.state === 'breakdown' || f.state === 'build';
    if (f.events?.includes('breakdown') || (f.events?.includes('build') && !wasLow)) {
      stageMax = 0;
      deviceDone = false;
      silent = false;
    }
    wasLow = low;
    if (f.events?.includes('start')) silent = false;
    if (events.some((e) => e.type === 'arm') && holding) queue.push('sit');
    if (stage > stageMax && low) {
      if (stageMax < 2 && stage >= 2) queue.push('stand');
      if (stageMax < 3 && stage >= 3) queue.push('Run');
      stageMax = stage;
    }
    if (!deviceDone && low && f.locked && f.bpm > 0 && f.breakdownFor >= 32 * (60 / f.bpm)) {
      queue.push('device');
      deviceDone = true;
    }
    if (f.events?.includes('return')) {
      queue.push('stand');
      stageMax = 0;
    }
    if (f.events?.includes('silence')) {
      silent = true;
      silentPresses = 0;
      stageMax = 0;
      queue = [];
    }
  }
  function press(newt) {
    if (!newt.grounded || newt.state === 'held' || newt.state === 'fall') {
      queue = [];
      return null;
    }
    if (
      silent &&
      !lying.has(newt.state) &&
      (silentPresses === 0 || (silentPresses === 1 && newt.state === 'deviceSit' && !newt.showing))
    ) {
      queue.push('device');
      silentPresses++;
    }
    while (queue.length) {
      const next = queue.shift();
      if (next === 'sit') {
        if (!sitting.has(newt.state) && !lying.has(newt.state)) return 'Sit';
      } else if (next === 'stand') {
        if (sitting.has(newt.state)) return 'Sit';
      } else if (next === 'device') {
        if (!lying.has(newt.state)) return 'Device';
      } else return next;
    }
    return null;
  }
  return {
    get position() {
      return position;
    },
    wave() {
      queue.push('Wave');
    },
    step(input) {
      const { t, f, events, newt, holding, released, cancelled } = input;
      sections(input);
      const gestures = [];
      let target = null,
        velocity = null;
      if (f.events?.includes('start')) gestures.push(gesture('tap', t, 'floor'));
      if ((released || cancelled) && newt.state === 'held') {
        gestures.push(gesture('release', t));
        velocity = reduced ? { x: 0, y: 0, z: 0 } : { x: 0.4, y: 1.2, z: 0 };
      }
      if (released || cancelled) grab = null;
      if (events.some((e) => e.type === 'drop') && !released && newt.state !== 'held') queue.push('Spook');
      if (f.events?.includes('drop') && f.drop === 'small' && !holding && !released && newt.state !== 'held')
        gestures.push(gesture('tap', t));
      const button = press(newt);
      const runPending = button === 'Run' || queue.includes('Run');
      if (!grab && holding && stageMax >= 4 && newt.grounded && newt.state !== 'flee' && !runPending) {
        // Keep the collar fixed while Run blends to Held and the root settles underneath it.
        grab = { t, collar: { ...newt.collar } };
        gestures.push(gesture('grab', t));
      }
      if (grab) {
        const approach = reduced ? 1 : Math.min(1, (t - grab.t) / 0.5);
        const lift = reduced ? 0.6 : 0.6 * Math.max(0, Math.min(1, (t - grab.t - 0.5) / 0.5));
        position = {
          x: grab.collar.x * approach,
          y: 1.35 + (grab.collar.y + LETTER_HANG - 1.35) * approach + lift,
          z: grab.collar.z * approach,
        };
        target = { ...grab.collar, y: grab.collar.y + lift };
      } else if (holding) position = null;
      return { button, events: gestures, target, released: velocity };
    },
  };
}
