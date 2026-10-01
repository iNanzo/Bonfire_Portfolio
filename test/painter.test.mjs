// The Bonfire Painter's pure parts: the panel (every field edits a part of the scene the
// format keeps, and says what it does, a "?" a keyboard stop only where no field reads it
// out), undo (a drag is one step; the limit), the silent beat (beats on the grid, bars
// counted, the drop loop's sections in order), the orbit math shared with photo mode (and the
// painted camera kept in the clearing), the panel's shape (a drag on the knights' count or a
// move leaving Still), the few colors' slots, the thumbnail's crop, and the stage's director
// and bonfire keeping the look being painted under reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelMarkup, panelShape, getPath, withPath, flameChips, sceneryChips, slotColors, SECTIONS, HINTS } from '../src/painter/panel.js';
import { thumbCrop, THUMB_W, THUMB_H } from '../src/painter/thumbs.js';
import { MAX_KNIGHTS } from '../src/visualizer/knightShow.js';
import { createHistory } from '../src/painter/history.js';
import { createBeatFeed, silentFrame, LOOP_BARS, DROP_LOOP } from '../src/painter/beat.js';
import { cameraAt, PAINT_LIMITS } from '../src/painter/cameraRig.js';
import { orbitPose, poseToOrbit, dragOrbit, zoomOrbit, panOrbit, PHOTO_LIMITS, ORBIT_TARGET } from '../src/ui/orbit.js';
import { defaultScene, normalizeScene, validateScene, DETAIL_KEYS } from '../src/scenes.js';
import { LAYERS, LAYER_BLENDS, LAYER_DETAILS, LOOK_PARAMS, DROP_FX } from '../src/visualizer/looks.js';
import { keepInClearing } from '../src/visualizer/clearing.js';
import { suggestFlames, suggestScenes } from '../src/paletteGen.js';

/** Every attribute value `name` in the markup. */
const attrs = (html, name) => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, '\''));
/** A scene with every optional part filled: its own scenery colors and drop hits, every layer on, every detail pinned, a few-color palette, four knights with moves. */
function fullScene() {
  const s = defaultScene('Everything');
  s.colors.scenery = { void: '#050608', shadow: '#15131d', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' };
  s.drops = { fx: Object.fromEntries(Object.keys(DROP_FX).map((k) => [k, 'mix'])), count: 3 };
  s.layers = Object.fromEntries(Object.keys(LAYERS).map((k) => [k, 'mix']));
  s.details = { ghostKeep: 0.9, glowSize: 3, grad: [0, 6, 8], paintR: 3, scan: 1, mirror: 2, flicker: 1, chroma: 2 };
  s.look = { name: 'kaleido', amount: 1.2, params: { segments: 8 } };
  s.render.palette = [0, 6, 8];
  s.knights = { ...s.knights, count: 4, helmets: ['great', null, 'armet', null], moves: ['nod', 'defaultDance'] };
  s.fireflies.moves = ['swing'];
  s.camera.move = { kind: 'push', amount: 0.5, bars: 8 };
  return normalizeScene(s);
}
const ctx = {
  weapons: { rapier: 'Rapier', greatsword: 'Greatsword' },
  flames: [{ key: 'ember', name: 'Ember Flame', colors: { lo: '#8c1d2f', mid: '#e0582a', hi: '#ffc76a', core: '#fff1d0', shade: '#2e1f1f', light: 0.34 } }],
  shots: [{ key: 'clearing', name: 'Clearing', camera: defaultScene().camera }],
};
const ALL_OPEN = SECTIONS.map(([id]) => id);

for (const [name, make] of [['a new scene', () => defaultScene()], ['a full scene', fullScene]]) {
  test(`panel (${name}): every field edits a part of the scene the format keeps`, () => {
    const scene = make();
    const html = panelMarkup(scene, { ...ctx, open: ALL_OPEN });
    const paths = attrs(html, 'data-scene');
    assert.ok(paths.length > 40, `${paths.length} fields`);
    for (const path of paths) {
      const detail = /^details\.(\w+)/.exec(path)?.[1];
      const param = /^look\.params\.(\w+)/.exec(path)?.[1];
      const blend = /^blends\.(\w+)$/.exec(path)?.[1];
      const helmet = /^knights\.helmets\.(\d)$/.exec(path)?.[1];
      if (detail) { assert.ok(DETAIL_KEYS.includes(detail), path); continue; } // (a detail: pinned, or rolled)
      if (blend) { assert.ok(Object.hasOwn(LAYER_BLENDS, blend), path); continue; }
      if (param) { assert.ok(LOOK_PARAMS[scene.look.name].includes(param), path); continue; }
      // (Every knight's helmet row is drawn; those past the count wait, hidden.)
      if (helmet && Number(helmet) >= scene.knights.count) { assert.match(html, new RegExp(`data-helmet="${helmet}" hidden`)); continue; }
      assert.notEqual(getPath(scene, path), undefined, `${path} is in the scene`);
    }
    // Chips pick values the format keeps as they are.
    for (const [path, value] of attrs(html, 'data-pick').map((p, i) => [p, attrs(html, 'data-value')[i]])) {
      const v = JSON.parse(value);
      const next = normalizeScene(withPath(scene, path, v));
      assert.deepEqual(getPath(next, path), v, `${path} = ${value}`);
    }
  });
  test(`panel (${name}): every field and group says what it does`, () => {
    const html = panelMarkup(make(), { ...ctx, open: ALL_OPEN });
    for (const hint of attrs(html, 'data-tip')) assert.ok(hint.length >= 20, `a short hint: "${hint}"`);
    // Every input bound to the scene is described by a hint…
    for (const m of html.matchAll(/<(input|select)[^>]*data-scene="([^"]+)"[^>]*>/g)) assert.match(m[0], /aria-describedby="viz-tip-\d+"/, `${m[2]} has no hint`);
    // …and every label, switch and group has its "?" (a row of a group, data-group-tip, the group's).
    const rowsLeftOut = html.replace(/<label class="viz-field" data-group-tip>\s*<span class="viz-field-label">[^<]*<\/span>/g, '');
    for (const m of rowsLeftOut.matchAll(/<(?:p|span) class="(?:viz-field-label|pnt-mode-name)">([\s\S]*?)<\/(?:p|span)>/g)) assert.match(m[1], /data-tip=/, `no "?" on ${m[1].slice(0, 40)}`);
    // Every hint a field reads out is in the markup, and a "?" is a keyboard stop of its own
    // only when no field reads its hint out (a color row's or a slot's would be a second stop):
    // not its id, nor the same words under another id (the helmets' group and each knight's).
    const ids = new Set([...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]));
    const hintText = new Map([...html.matchAll(/<span class="visually-hidden" id="([^"]+)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]));
    const stops = new Set([...html.matchAll(/<span class="viz-tip" tabindex="0"[^>]*aria-describedby="([^"]+)"/g)].map((m) => m[1]));
    const read = new Set();
    for (const m of html.matchAll(/<(input|select|textarea|button)\b[^>]*aria-describedby="([^"]+)"/g)) {
      for (const id of m[2].split(/\s+/)) {
        assert.ok(ids.has(id), `${m[0].slice(0, 60)}… points at a missing hint (${id})`);
        assert.ok(!stops.has(id), `${m[0].slice(0, 60)}… reads out a hint whose "?" is a stop too`);
        read.add(hintText.get(id));
      }
    }
    assert.ok(stops.size > 0 && read.size > 20, `(stops ${stops.size}, hints read out ${read.size})`);
    for (const id of stops) assert.ok(!read.has(hintText.get(id)), `a "?" stop repeats a hint a field reads out: "${hintText.get(id)?.slice(0, 60)}…"`);
    // Title Case labels.
    for (const m of html.matchAll(/class="viz-field-label">([^<?]+?) (?:<|$)/g)) {
      const words = m[1].trim().split(/\s+/).filter((w) => !['a', 'an', 'the', 'of', 'to', 'in', 'by', 'and', 'or', 'on', 'from', 'for', 'at', 'as', 'per'].includes(w));
      for (const w of words) assert.match(w, /^[A-Z0-9“‘(]/, `"${m[1].trim()}" isn't Title Case`);
    }
  });
}

test('panel: hints for every layer, drop hit and section; its shape follows the layout, not the values', () => {
  const s = defaultScene();
  const html = panelMarkup(s, { ...ctx, open: ALL_OPEN });
  for (const [id] of SECTIONS) assert.match(html, new RegExp(`data-sec="${id}"`));
  for (const k of Object.keys(LAYERS)) assert.match(html, new RegExp(`data-pick="layers\\.${k}"`));
  assert.ok(Object.values(HINTS).every((h) => h.length >= 20));
  // A layer turned on shows its details (the shape changes); a slider moved doesn't.
  const on = withPath(s, 'layers.glow', 'on');
  assert.notEqual(panelShape(on), panelShape(s));
  assert.match(panelMarkup(normalizeScene(on), { ...ctx, open: ['layers'] }), /data-scene="details\.glowSize"/);
  assert.doesNotMatch(panelMarkup(s, { ...ctx, open: ['layers'] }), /data-scene="details\.glowSize"/);
  assert.equal(panelShape(withPath(s, 'fire.level', 0.5)), panelShape(s));
  // Only the open sections show (the rest are there, folded).
  assert.match(panelMarkup(s, ctx), /id="pnt-b-look" hidden/);
});

test('panel: a drag on Knights by the Fire keeps its slider; a move leaving Still shows its size', () => {
  const s = defaultScene();
  // One to four knights: the same shape (the helmet rows are all drawn, the extra ones hidden)…
  const shapes = [1, 2, 3, 4].map((n) => panelShape(normalizeScene(withPath(s, 'knights.count', n))));
  assert.equal(new Set(shapes).size, 1, 'the count alone never redraws the panel');
  const two = panelMarkup(normalizeScene(withPath(s, 'knights.count', 2)), { ...ctx, open: ['knights'] });
  for (let i = 0; i < MAX_KNIGHTS; i++) assert.match(two, new RegExp(`data-helmet="${i}"${i < 2 ? '>' : ' hidden>'}`));
  // …none is another (the rest of the section goes).
  assert.notEqual(panelShape(normalizeScene(withPath(s, 'knights.count', 0))), shapes[0]);
  assert.doesNotMatch(panelMarkup(normalizeScene(withPath(s, 'knights.count', 0)), { ...ctx, open: ['knights'] }), /data-helmet=/);
  // Still has no size to set; any other move has (so leaving Still draws its fields).
  const still = normalizeScene(withPath(s, 'camera.move', { kind: 'still', amount: 0, bars: 4 }));
  const crane = normalizeScene(withPath(still, 'camera.move.kind', 'crane'));
  assert.notEqual(panelShape(crane), panelShape(still));
  assert.doesNotMatch(panelMarkup(still, { ...ctx, open: ['camera'] }), /data-scene="camera\.move\.amount"/);
  assert.match(panelMarkup(crane, { ...ctx, open: ['camera'] }), /data-scene="camera\.move\.amount"/);
});

test('panel: the few colors\' slots are the scene\'s palette slots, pressed as picked', () => {
  const s = normalizeScene(withPath(defaultScene(), 'render.palette', [0, 6, 8]));
  const html = panelMarkup(s, { ...ctx, open: ['render'] });
  const cols = slotColors(s);
  const slots = [...html.matchAll(/data-slot="(\d)" aria-pressed="(true|false)"[^>]*><i style="--c:([^"]+)"/g)];
  assert.equal(slots.length, 10);
  for (const [, i, pressed, c] of slots) {
    assert.equal(pressed === 'true', [0, 6, 8].includes(Number(i)), `slot ${i}`);
    assert.equal(c, cols[Number(i)]);
  }
});

test('thumbnails: cut round the middle of the part of the stage the panel leaves showing', () => {
  // The whole frame: its middle 16:9.
  const all = thumbCrop(1600, 1000);
  assert.ok(Math.abs(all.sw / all.sh - THUMB_W / THUMB_H) < 1e-9);
  assert.equal(all.sw, 1600);
  assert.ok(Math.abs(all.sy - (1000 - 900) / 2) < 1e-9);
  // The panel's column (384 px of 1600) covered: the box is centered in what's left, and inside it.
  const area = { x: 0, y: 0, w: 1 - 384 / 1600, h: 1 };
  const c = thumbCrop(1600, 1000, area);
  assert.ok(Math.abs(c.sx + c.sw / 2 - (1600 - 384) / 2) < 1e-9, 'centered where the fire is framed');
  assert.ok(c.sx >= 0 && c.sx + c.sw <= 1600 - 384 + 1e-9, 'nothing from under the panel');
  assert.ok(Math.abs(c.sw / c.sh - THUMB_W / THUMB_H) < 1e-9);
  // A phone: the bottom sheet covers the lower 46%; a tall frame is cut above it.
  const phone = thumbCrop(390, 844, { x: 0, y: 0, w: 1, h: 0.54 });
  assert.ok(phone.sy >= 0 && phone.sy + phone.sh <= 844 * 0.54 + 1e-9);
  assert.equal(phone.sw, 390);
});

test('panel: suggested flames and scenery are valid scene colors', () => {
  const s = defaultScene();
  const flames = suggestFlames('#3fa7ff', { voidHex: '#07070b' });
  for (const v of attrs(flameChips(flames, 0.3), 'data-value').map((x) => JSON.parse(x))) {
    const next = normalizeScene(withPath(s, 'colors.flame', v));
    const errors = [];
    validateScene(next, (p, m) => errors.push(`${p}: ${m}`));
    assert.deepEqual(errors, []);
    assert.equal(next.colors.flame.light, 0.3);
  }
  for (const v of attrs(sceneryChips(suggestScenes('#3fa7ff', { flames: [{ hi: s.colors.flame.hi }] })), 'data-value').map((x) => JSON.parse(x))) {
    const errors = [];
    validateScene(normalizeScene(withPath(s, 'colors.scenery', v)), (p, m) => errors.push(`${p}: ${m}`));
    assert.deepEqual(errors, []);
  }
});

test('paths: get and set by dotted path, copies only, undefined takes a detail back to the dice', () => {
  const s = fullScene();
  assert.equal(getPath(s, 'knights.helmets.2'), 'armet');
  assert.equal(getPath(s, 'nope.deeper'), undefined);
  const t = withPath(s, 'knights.helmets.1', 'bascinet');
  assert.equal(t.knights.helmets[1], 'bascinet');
  assert.equal(s.knights.helmets[1], null, 'the original is untouched');
  const u = withPath(s, 'details.glowSize', undefined);
  assert.ok(!('glowSize' in u.details));
  assert.equal(withPath({}, 'a.b.c', 1).a.b.c, 1);
});

test('history: a drag is one step; undo and redo walk back and forth; a new edit drops the redo', () => {
  let t = 0;
  const h = createHistory({ limit: 5, coalesceMs: 600, now: () => t });
  let s = { v: 0 };
  const edit = (v, key) => { h.push(s, key); s = { v }; };
  edit(1, 'glow');
  t += 100; edit(2, 'glow');
  t += 100; edit(3, 'glow');   // (the same slider, close together: one step)
  assert.equal(h.size, 1);
  t += 1000; edit(4, 'glow'); // (a pause: a new step)
  t += 50; edit(5, 'grain');  // (another field: a new step)
  assert.equal(h.size, 3);
  s = h.undo(s); assert.equal(s.v, 4);
  s = h.undo(s); assert.equal(s.v, 3);
  s = h.undo(s); assert.equal(s.v, 0);
  assert.equal(h.undo(s), null);
  assert.ok(!h.canUndo && h.canRedo);
  s = h.redo(s); assert.equal(s.v, 3);
  edit(9, null);
  assert.ok(!h.canRedo, 'a new edit drops what could be redone');
  // seal(): the next edit is a step of its own even on the same field.
  edit(10, 'x'); h.seal(); t += 10; edit(11, 'x');
  const before = h.size;
  // The limit: the oldest go.
  for (let i = 0; i < 20; i++) { t += 1000; edit(20 + i, null); }
  assert.equal(h.size, 5);
  assert.ok(before >= 3);
  // Kept states are copies.
  const obj = { deep: { n: 1 } };
  const h2 = createHistory();
  h2.push(obj, null);
  obj.deep.n = 2;
  assert.equal(h2.undo({}).deep.n, 1);
});

/** Run a feed from `start` for `seconds` at 60 fps, collecting beats and events with their times. */
function run(feed, start, seconds) {
  const beats = [];
  const events = [];
  const frames = [];
  for (let t = start; t < start + seconds; t += 1 / 60) {
    const f = feed.frame(t, 1 / 60);
    for (const b of f.beats) beats.push({ ...b, at: t });
    for (const e of f.events) events.push({ e, at: t, bar: f.beats.at(-1)?.bar ?? null, state: f.state, drop: f.drop });
    frames.push(f);
  }
  return { beats, events, frames };
}

test('beat: a groove at 124 BPM, a beat every period, bars counted, beat 1 on each downbeat, locked', () => {
  const feed = createBeatFeed({ bpm: 124, shape: 'groove', start: 10 });
  const { beats, events, frames } = run(feed, 10, 8);
  const period = 60 / 124;
  assert.equal(events[0].e, 'start');
  assert.ok(beats.length >= 16 && beats.length <= 17, `${beats.length} beats in 8 s`);
  for (let i = 1; i < beats.length; i++) {
    assert.ok(Math.abs(beats[i].time - beats[i - 1].time - period) < 1e-9);
    assert.equal(beats[i].count, beats[i - 1].count + 1);
    assert.equal(beats[i].beat, beats[i].count % 4);
    assert.equal(beats[i].bar, Math.floor(beats[i].count / 4));
  }
  assert.ok(beats.every((b) => b.strength > 0.5));
  assert.ok(beats.filter((b) => b.beat === 0).every((b) => b.strength > beats.find((x) => x.beat === 1).strength));
  assert.ok(frames.every((f) => f.locked && f.state === 'groove' && f.bpm === 124));
  // Kicks land with the beats; hats between them.
  assert.ok(frames.filter((f) => f.kick > 0).length >= 15);
  assert.ok(frames.filter((f) => f.hat > 0).length >= 14);
  // The shape the director reads.
  for (const k of ['time', 'rms', 'level', 'kick', 'hat', 'beats', 'events', 'bands', 'bpm', 'locked', 'strength', 'state', 'build', 'intensity', 'drop']) assert.ok(k in frames[0], k);
  assert.deepEqual(Object.keys(silentFrame().bands), Object.keys(frames[0].bands));
  // Early by the lead.
  const lead = run(createBeatFeed({ bpm: 124, start: 0, lead: 0.1 }), 0, 2).beats;
  assert.ok(lead.every((b) => b.at < b.time && b.time - b.at <= 0.1 + 1 / 60));
});

test('beat: the drop loop runs groove → breakdown → build → the drop, the bar count starting again at it', () => {
  const bpm = 124;
  const loop = (LOOP_BARS * 4 * 60) / bpm;
  const feed = createBeatFeed({ bpm, shape: 'dropLoop', start: 0 });
  const { beats, events, frames } = run(feed, 0, 2 * loop + 1);
  const seq = events.map((x) => x.e);
  assert.deepEqual(seq, ['start', 'breakdown', 'build', 'drop', 'breakdown', 'build', 'drop']);
  const at = (name, n = 0) => events.filter((x) => x.e === name)[n];
  assert.equal(at('breakdown').bar, DROP_LOOP.groove);
  assert.equal(at('build').bar, DROP_LOOP.groove + DROP_LOOP.breakdown);
  assert.equal(at('drop').bar, 0);
  assert.equal(at('drop').drop, 'big');
  // (Beat 0 falls 50 ms after the start.)
  assert.ok(Math.abs(at('drop').at - (0.05 + loop)) < 0.03, `the drop at ${at('drop').at.toFixed(2)} s (a loop is ${loop.toFixed(2)} s)`);
  // The build climbs through the breakdown and the build, past the stages the director counts.
  const low = frames.filter((f) => f.state === 'breakdown' || f.state === 'build');
  for (let i = 1; i < low.length; i++) if (low[i].time - low[i - 1].time < 0.1) assert.ok(low[i].build >= low[i - 1].build - 1e-9);
  assert.ok(Math.max(...low.map((f) => f.build)) > 0.95);
  assert.ok(frames.filter((f) => f.state === 'breakdown').every((f) => f.kick === 0 && f.bands.bass < 0.2));
  // The count starts again at each drop: bar 0, beat 1.
  const afterDrop = beats.find((b) => b.at >= at('drop').at);
  assert.equal(afterDrop.count, 0);
  assert.ok(beats.filter((b) => b.bar >= LOOP_BARS).length === 0);
});

test('beat: a drop by hand lands on the next frame and the count starts again on the next beat', () => {
  const feed = createBeatFeed({ bpm: 124, start: 0 });
  run(feed, 0, 5);
  feed.drop();
  const f = feed.frame(5, 1 / 60);
  assert.ok(f.events.includes('drop'));
  assert.equal(f.drop, 'big');
  const { beats } = run(feed, 5 + 1 / 60, 1);
  assert.equal(beats[0].count, 0);
  assert.equal(beats[0].bar, 0);
});

test('orbit: a pose and its orbit go both ways; drags, zooms and slides keep to their limits', () => {
  const rnd = ((seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; })(7);
  for (let i = 0; i < 500; i++) {
    const pose = { pos: [(rnd() - 0.5) * 12, rnd() * 6 + 0.2, (rnd() - 0.5) * 12], target: [(rnd() - 0.5) * 2, rnd(), (rnd() - 0.5) * 2] };
    const back = orbitPose(poseToOrbit(pose));
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(back.pos[k] - pose.pos[k]) < 1e-9);
      assert.ok(Math.abs(back.target[k] - pose.target[k]) < 1e-12);
    }
  }
  // Photo mode's: as it always did (turn 0.006 rad a pixel, tilt 0.004, zoom e^(0.001·dy)).
  const v = { yaw: 0, pitch: 0.32, dist: 4.2 };
  const d = dragOrbit(v, 100, 50);
  assert.ok(Math.abs(d.yaw + 0.6) < 1e-12 && Math.abs(d.pitch - 0.52) < 1e-12);
  assert.equal(dragOrbit(v, 0, 10000).pitch, PHOTO_LIMITS.pitch[1]);
  assert.equal(dragOrbit(v, 0, -10000).pitch, PHOTO_LIMITS.pitch[0]);
  assert.ok(Math.abs(zoomOrbit(v, 100).dist - 4.2 * Math.exp(0.1)) < 1e-12);
  assert.equal(zoomOrbit(v, -1e5).dist, PHOTO_LIMITS.dist[0]);
  assert.deepEqual(orbitPose(v).target, ORBIT_TARGET);
  // A slide moves what it looks at across the view (not toward or away from the camera).
  const p = panOrbit({ ...v, target: [0, 0.5, 0] }, 40, -30, { fov: 32, height: 800 });
  const before = orbitPose({ ...v, target: [0, 0.5, 0] });
  const after = orbitPose(p);
  const view = before.pos.map((x, i) => before.target[i] - x);
  const moved = p.target.map((x, i) => x - [0, 0.5, 0][i]);
  const dot = view.reduce((s, x, i) => s + x * moved[i], 0);
  assert.ok(Math.abs(dot) < 1e-9, 'the slide is across the view');
  assert.ok(Math.hypot(...moved) > 0.05);
  assert.ok(Math.abs(Math.hypot(...after.pos.map((x, i) => x - after.target[i])) - v.dist) < 1e-9, 'the distance is kept');
});

test('the camera by hand stays in the clearing, and what it looks at near the fire', () => {
  const cam = defaultScene().camera;
  const rnd = ((seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; })(3);
  for (let i = 0; i < 400; i++) {
    const view = { yaw: (rnd() - 0.5) * 8, pitch: PAINT_LIMITS.pitch[0] + rnd() * (PAINT_LIMITS.pitch[1] - PAINT_LIMITS.pitch[0]), dist: PAINT_LIMITS.dist[0] + rnd() * 12, target: [(rnd() - 0.5) * 12, rnd() * 8 - 2, (rnd() - 0.5) * 12] };
    const c = cameraAt(cam, view);
    const k = keepInClearing({ x: c.pos[0], y: c.pos[1], z: c.pos[2] });
    assert.ok(Math.hypot(k.x - c.pos[0], k.y - c.pos[1], k.z - c.pos[2]) < 1e-9);
    const errors = [];
    validateScene(normalizeScene({ ...defaultScene(), camera: c }), (p, m) => errors.push(`${p}: ${m}`));
    assert.deepEqual(errors.filter((e) => e.startsWith('scene.camera.pos')), []);
    assert.equal(c.fov, cam.fov);
    assert.deepEqual(c.move, cam.move);
  }
});

test('panel: every layer with details lists them (looks.js LAYER_DETAILS) when it is on', () => {
  const s = fullScene();
  const html = panelMarkup(s, { ...ctx, open: ['layers'] });
  for (const [layer, keys] of Object.entries(LAYER_DETAILS)) {
    for (const k of keys) {
      if (k === 'grad') assert.match(html, /data-scene="details\.grad\.0"/, layer);
      else assert.match(html, new RegExp(`data-scene="details\\.${k}"`), `${layer}: ${k}`);
    }
  }
  // Locks: pinned ones pressed, rolled ones not.
  assert.match(html, /data-lock="details\.glowSize" aria-pressed="true"/);
  assert.match(html, /data-lock="details\.glowCut" aria-pressed="false"/);
});

test('the stage: the Painter\'s director and bonfire keep the look being painted under reduced motion (paintedLook)', () => {
  // (main.js is the page itself, so its calls are read: under reduced motion, a director made
  // without paintedLook plays every scene's look as Ember, and a bonfire made without it keeps
  // every effect that isn't a still one off the stage, so the Painter would paint blind. What
  // paintedLook does is tested with the director, scenePlayer.test.mjs, and the pass's gate,
  // stillFx.test.mjs.)
  const src = readFileSync(new URL('../src/painter/main.js', import.meta.url), 'utf8');
  const call = /createDirector\(candidate, \{([^}]*)\}\)/.exec(src);
  assert.ok(call, 'the Painter makes its director');
  assert.match(call[1], /\breducedMotion\b/);
  assert.match(call[1], /\bpaintedLook: true\b/);
  const bonfire = /createBonfire\(stage, \{(.*)\}\);/.exec(src);
  assert.ok(bonfire, 'the Painter makes its bonfire');
  assert.match(bonfire[1], /^ reducedMotion, paintedLook: true,/);
  // (Bonfire Live and the site don't: their reduced motion keeps only the still effects.)
  for (const page of ['../src/visualizer/main.js', '../src/main.js']) {
    assert.doesNotMatch(readFileSync(new URL(page, import.meta.url), 'utf8'), /paintedLook/, page);
  }
});
