// The letter machines have one owner. Renderer bindings consume views and petal commands.
import { createEnvelope, TIMES, BOB } from '../../invitation/envelope.js';
import { PAGES } from './pages.js';
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
      letter.cancelled = true;
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
      active.released = true;
      if (active.dismissed) skip(active);
      else {
        active.ready = true;
        open(active);
      }
      return true;
    },
    /** @param {{t:number, f?:Record<string, any>, events?:any[]}} input */
    step({ t: now, f = {}, events = [] }) {
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
        if (active.released && f.events?.includes('drop') && f.drop === 'big') active.bigDrop = true;
      }
      const downbeat = f.locked && f.beats?.some((b) => b.beat === 0);
      for (const letter of letters) {
        if (letter.kind === 'quick' && letter.openedAt === null && letter.time - letter.born >= TIMES.arrive) {
          open(letter, letter.born + TIMES.arrive);
          letter.ready = true;
        }
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
        if (state === 'fading' && before !== 'fading') apply(letter);
        if (letter.skipping && letter.env.done(letter.time)) apply(letter);
      }
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
            x: l.kind === 'quick' ? 0.9 : 0,
            y: l.kind === 'quick' ? 0.35 : 1.35,
          };
        });
      for (let i = letters.length - 1; i >= 0; i--) if (letters[i].env.done(letters[i].time)) letters.splice(i, 1);
      const page = turn ? { ...turn, k: Math.min(1, (t - turn.at) / TIMES.clear) } : null;
      if (page?.k === 1) turn = null;
      const result = { letters: views, petals: commands, page };
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
