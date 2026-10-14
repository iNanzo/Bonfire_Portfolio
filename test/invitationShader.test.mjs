// The invitation toy's Shader options (src/invitation/shader.js and look.js): one table of
// controls (SHADER_CONTROLS) that the Look menu renders, each with a Title Case label, a range or
// choices that hold every style's own value, and where it lives in a look preset; the styles
// (DS, Soft) set every one; the look keeps only the user's changes, each checked on its own
// (clamped onto its range and steps, a wrong type dropped, the style's own value dropped), so an
// old or broken stored look loads as the style; lookPreset writes the changes into a copy of the
// style for the renderer, never into the style itself; the toon ramp (Smooth, 2, 3 or 4 bands, a
// highlight) gives DS's and Soft's old gradients back exactly; and the warmth tint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHADER_CONTROLS,
  TOON_CELLS,
  controlFor,
  shaderText,
  snapShader,
  styleShader,
  toonRamp,
  warmthTint,
} from '../src/invitation/shader.js';
import {
  DEFAULT_LOOK,
  LOOKS,
  STYLES,
  isCustom,
  loadLook,
  lookPreset,
  presetOf,
  saveLook,
  shaderOf,
  validLook,
} from '../src/invitation/look.js';
import { sheetHtml } from '../src/invitation/ui.js';

const KEYS = SHADER_CONTROLS.map((c) => c.key);
/** A storage stand-in. */
const store = (get, set = () => {}) => ({ getItem: get, setItem: set });

test('the Shader controls: one table, every entry labelled in Title Case, a kind, and a range or choices holding every style’s value', () => {
  assert.deepEqual(KEYS, [
    'levels',
    'dither',
    'outline',
    'ink',
    'ring',
    'bands',
    'highlight',
    'edge',
    'shadow',
    'turn',
    'light',
    'saturation',
    'warmth',
    'exposure',
    'contrast',
  ]);
  assert.equal(new Set(KEYS).size, KEYS.length, 'each key once');
  assert.deepEqual(
    SHADER_CONTROLS.map((c) => c.label),
    [
      'Colors',
      'Dither Strength',
      'Outline Strength',
      'Outline Color',
      'Outer Ring',
      'Toon Shading',
      'Highlight',
      'Shadow',
      'Shadow Strength',
      'Light Angle',
      'Light Strength',
      'Saturation',
      'Warmth',
      'Brightness',
      'Contrast',
    ],
  );
  for (const c of SHADER_CONTROLS) {
    assert.match(c.label, /^[A-Z][^ ]*( [A-Z][^ ]*)*$/, `${c.key}: Title Case`);
    assert.ok(['range', 'choice', 'switch'].includes(c.kind), `${c.key}: a kind`);
    if (c.kind === 'range' && !c.steps) assert.ok(c.min < c.max && c.step > 0, `${c.key}: a range`);
    if (c.kind === 'range' && c.steps) assert.ok(c.steps.length >= 3, `${c.key}: its steps`);
    if (c.kind === 'choice') {
      assert.ok(c.options.length >= 2, `${c.key}: choices`);
      for (const o of c.options) assert.match(o.label, /^[A-Z0-9]/, `${c.key} ${o.value}`);
    }
    assert.equal(typeof c.pixelOnly, 'boolean', `${c.key}: says whether it applies at Pixel Size Off`);
    for (const style of STYLES) {
      const v = c.get(LOOKS[style]);
      assert.deepEqual(snapShader(c, v), v, `${style} ${c.key}: ${JSON.stringify(v)} is on the control`);
      assert.equal(typeof shaderText(c, v).shown, 'string');
      assert.ok(shaderText(c, v).spoken.length > 0, `${style} ${c.key}: value text`);
    }
  }
  assert.equal(controlFor('levels').label, 'Colors');
  assert.equal(controlFor('nope'), undefined);
  // The ones that are part of the pixel look rest at Off; toon shading, the shadow's strength
  // and the light still show there.
  assert.deepEqual(
    SHADER_CONTROLS.filter((c) => !c.pixelOnly).map((c) => c.key),
    ['bands', 'highlight', 'shadow', 'turn', 'light'],
  );
});

test('each control reads as it should: Colors as a number or Full, strengths as percents, the light’s angle in degrees, warmth as warm or cool', () => {
  const t = (key, v) => shaderText(controlFor(key), v);
  assert.deepEqual(t('levels', 32), { shown: '32', spoken: '32 levels' });
  assert.deepEqual(t('levels', 256), { shown: 'Full', spoken: 'Full' });
  assert.deepEqual(t('dither', 0.25), { shown: '25%', spoken: '25%' });
  assert.deepEqual(t('dither', 0), { shown: 'Off', spoken: 'Off' });
  assert.deepEqual(t('turn', -45), { shown: '-45°', spoken: '-45 degrees' });
  assert.deepEqual(t('warmth', 0), { shown: 'Neutral', spoken: 'Neutral' });
  assert.deepEqual(t('warmth', 0.4), { shown: 'Warm 40%', spoken: 'Warm 40%' });
  assert.deepEqual(t('warmth', -0.25), { shown: 'Cool 25%', spoken: 'Cool 25%' });
  assert.deepEqual(t('light', 1.5), { shown: '150%', spoken: '150%' });
  assert.deepEqual(t('bands', 'smooth'), { shown: 'Smooth', spoken: 'Smooth' });
  assert.deepEqual(t('ring', true), { shown: 'On', spoken: 'On' });
});

test('a value onto its control: clamped into the range, onto its steps, a choice or a switch kept only when it is one', () => {
  const s = (key, v) => snapShader(controlFor(key), v);
  assert.equal(s('dither', 0.33), 0.35, 'onto its 5% steps');
  assert.equal(s('dither', 7), 1, 'clamped');
  assert.equal(s('dither', -1), 0);
  assert.equal(s('dither', '0.5'), undefined, 'not a number');
  assert.equal(s('dither', Number.NaN), undefined);
  assert.equal(s('levels', 30), 28, 'Colors onto its nearest step');
  assert.equal(s('levels', 2), 4);
  assert.equal(s('levels', 9999), 256, 'past its end: Full');
  assert.equal(s('turn', 400), 180);
  assert.equal(s('exposure', 1.024), 1.02);
  assert.equal(s('ink', 'tinted'), 'tinted');
  assert.equal(s('ink', 'red'), undefined, 'not one of its choices');
  assert.equal(s('bands', '3'), '3');
  assert.equal(s('bands', 3), undefined, 'choices are strings');
  assert.equal(s('ring', false), false);
  assert.equal(s('ring', 'yes'), undefined);
});

test('the styles set every control; the look keeps only the user’s changes, checked one by one, and a change back to the style’s value is no change', () => {
  for (const style of STYLES) {
    const look = validLook({ style });
    assert.deepEqual(look.shader, {}, `${style}: nothing changed`);
    assert.equal(isCustom(look), false);
    assert.deepEqual(shaderOf(look), styleShader(LOOKS[style]), `${style}: the style’s own values`);
    assert.deepEqual(Object.keys(shaderOf(look)), KEYS, `${style}: every control`);
  }
  assert.deepEqual(DEFAULT_LOOK.shader, {});
  const ds = styleShader(LOOKS.ds);
  const changed = validLook({
    style: 'ds',
    shader: { levels: 8, dither: 0.33, ring: !ds.ring, bands: '4', turn: 1000, saturation: ds.saturation },
  });
  assert.deepEqual(
    changed.shader,
    { levels: 8, dither: 0.35, ring: !ds.ring, bands: '4', turn: 180 },
    'snapped and clamped; the style’s own saturation is no change',
  );
  assert.equal(isCustom(changed), true);
  assert.deepEqual(shaderOf(changed), { ...ds, levels: 8, dither: 0.35, ring: !ds.ring, bands: '4', turn: 180 });
  // Broken values fall back one by one (to the style's), unknown keys and wrong shapes go.
  const broken = validLook({
    style: 'soft',
    shader: { levels: 'many', dither: 0.5, ink: 'red', nope: 1, highlight: 'no', edge: 'hard' },
  });
  const soft = styleShader(LOOKS.soft);
  assert.deepEqual(broken.shader, { dither: 0.5, edge: 'hard' });
  assert.deepEqual(shaderOf(broken), { ...soft, dither: 0.5, edge: 'hard' });
  for (const shader of [null, 'x', 7, [1, 2], undefined])
    assert.deepEqual(validLook({ style: 'soft', shader }).shader, {}, JSON.stringify(shader));
});

test('a stored look from before the Shader options loads as its style, and the changes survive a save and a reload', () => {
  const old = JSON.stringify({ pixelSize: '64', dither: false, outlines: true, style: 'soft', motion: 'choppy' });
  const loaded = loadLook(store(() => old));
  assert.deepEqual(loaded, {
    pixelSize: '64',
    dither: false,
    outlines: true,
    style: 'soft',
    motion: 'choppy',
    shader: {},
  });
  assert.deepEqual(shaderOf(loaded), styleShader(LOOKS.soft));
  let saved = null;
  const look = validLook({ ...DEFAULT_LOOK, shader: { levels: 12, bands: 'smooth', warmth: -0.5 } });
  saveLook(
    look,
    store(
      () => null,
      (k, v) => (saved = v),
    ),
  );
  assert.deepEqual(JSON.parse(saved).shader, { levels: 12, bands: 'smooth', warmth: -0.5 }, 'only the changes');
  assert.deepEqual(loadLook(store(() => saved)), look);
});

test('lookPreset: the style with the user’s changes written into a copy, which the renderer reads like any preset', () => {
  assert.deepEqual(lookPreset(DEFAULT_LOOK), presetOf(DEFAULT_LOOK), 'no changes: the style as it is');
  const look = validLook({
    style: 'ds',
    shader: {
      levels: 256,
      dither: 1,
      outline: 0.2,
      ink: 'tinted',
      ring: true,
      bands: '3',
      highlight: false,
      edge: 'soft',
      shadow: 0.8,
      turn: 90,
      light: 1.5,
      saturation: 0.5,
      warmth: 0.6,
      exposure: 1.3,
      contrast: 1.4,
    },
  });
  const p = lookPreset(look);
  const ds = LOOKS.ds;
  assert.notEqual(p, ds);
  assert.equal(p.levels, 256, 'Full: every level an 8-bit channel has');
  assert.equal(p.dither, 1);
  assert.equal(p.outline.darken, 0.2);
  assert.equal(p.outline.ink, 'tinted');
  assert.equal(p.outline.outside, true);
  assert.deepEqual(p.toon, { ...ds.toon, bands: 3, highlight: false });
  assert.ok(p.shadow.soft >= 1 && p.shadow.steps >= 2, 'a soft, stepped edge');
  assert.equal(p.shadow.opacity, 0.8);
  assert.equal(p.sun.turn, 90);
  assert.equal(p.sun.strength, 1.5);
  assert.equal(p.grade.saturation, 0.5);
  assert.equal(p.grade.warmth, 0.6);
  assert.equal(p.grade.exposure, 1.3);
  assert.equal(p.grade.contrast, 1.4);
  // The style itself is untouched, and what the look leaves alone is the style's.
  assert.deepEqual(styleShader(LOOKS.ds), styleShader(ds));
  assert.equal(ds.levels, LOOKS.ds.levels);
  assert.equal(p.background, ds.background);
  assert.deepEqual(p.hemi, ds.hemi);
  assert.equal(p.shadow.color, ds.shadow.color);
  // Hard again: no softening, no steps.
  const hard = lookPreset(validLook({ style: 'soft', shader: { edge: 'hard' } }));
  assert.equal(hard.shadow.soft, 0);
  assert.equal(hard.shadow.steps, 0);
  assert.equal(LOOKS.soft.shadow.soft > 0, true, 'Soft’s own shadow is still soft');
});

test('the toon ramp: 2 bands and a highlight give DS’s and Soft’s old gradients back exactly; 3 and 4 bands step evenly from shade to lit; Smooth ramps; no highlight tops out at lit', () => {
  assert.equal(TOON_CELLS, 64);
  /** A ramp sampled at `n` cells' middles, as an `n`-texel nearest gradient would give it. */
  const at = (ramp, n) => Array.from({ length: n }, (_, i) => ramp[Math.floor(((i + 0.5) / n) * ramp.length)]);
  assert.deepEqual(at(toonRamp(LOOKS.ds.toon), 8), [0.5, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1], 'DS as it was');
  assert.deepEqual(at(toonRamp(LOOKS.soft.toon), 8), [0.5, 0.5, 0.5, 0.5, 0.85, 0.85, 0.85, 1], 'Soft as it was');
  const spec = { bands: 2, highlight: true, shade: 0.4, lit: 0.9 };
  for (const bands of [2, 3, 4]) {
    const ramp = toonRamp({ ...spec, bands, highlight: false });
    assert.equal(ramp.length, TOON_CELLS);
    const values = [...new Set(ramp)];
    assert.equal(values.length, bands, `${bands} bands: ${values}`);
    assert.ok(Math.abs(values[0] - 0.4) < 1e-9 && Math.abs(values.at(-1) - 0.9) < 1e-9, 'shade to lit');
    for (let i = 1; i < ramp.length; i++) assert.ok(ramp[i] >= ramp[i - 1], 'darker away from the light');
  }
  const smooth = toonRamp({ ...spec, bands: 0, highlight: false });
  assert.ok(new Set(smooth).size >= 16, 'Smooth: no bands to speak of');
  assert.ok(Math.abs(smooth[0] - 0.4) < 1e-9 && Math.abs(smooth.at(-1) - 0.9) < 1e-9);
  assert.equal(Math.max(...toonRamp({ ...spec, highlight: false })), 0.9, 'no highlight: lit at most');
  assert.equal(Math.max(...toonRamp(spec)), 1, 'a highlight: white where the light falls straight');
  assert.deepEqual(toonRamp([0.5, 0.8, 1]), [0.5, 0.8, 1], 'an old preset’s own bands, as they are');
});

test('warmth tints the grade warm or cool, and neutral leaves it be', () => {
  assert.deepEqual(warmthTint(0), [1, 1, 1]);
  const [r, g, b] = warmthTint(1);
  assert.ok(r === 1 && g < 1 && b < g, `warm: less blue than green (${[r, g, b]})`);
  const [cr, cg, cb] = warmthTint(-1);
  assert.ok(cb === 1 && cr < cg, `cool: less red than green (${[cr, cg, cb]})`);
  const half = warmthTint(0.5);
  assert.ok(half[2] > b && half[2] < 1, 'half way');
});

/** A string as a RegExp source, literally. */
const lit = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the Look sheet’s Shader section: every control from the table, labelled, its value shown and spoken; Custom once a value is the user’s, with Reset To Style; the pixel-look ones resting at Off', () => {
  const html = sheetHtml(DEFAULT_LOOK);
  assert.match(html, /<h3 id="inv-shader-title">Shader<\/h3>/);
  const values = shaderOf(DEFAULT_LOOK);
  for (const c of SHADER_CONTROLS) {
    const v = values[c.key];
    const { shown, spoken } = shaderText(c, v);
    if (c.kind === 'range') {
      const input = new RegExp(`<input type="range"[^>]*id="inv-shader-${c.key}"[^>]*>`).exec(html)?.[0] ?? '';
      assert.ok(input, `${c.key}: a slider`);
      assert.match(html, new RegExp(`<label[^>]*for="inv-shader-${c.key}"[^>]*>${lit(c.label)}</label>`), c.key);
      assert.match(input, new RegExp(`value="${c.steps ? c.steps.indexOf(v) : v}"`), `${c.key}: the style’s value`);
      assert.match(input, new RegExp(`aria-valuetext="${lit(spoken)}"`), `${c.key}: spoken`);
      assert.match(input, new RegExp(`data-shader="${c.key}"`));
      assert.match(html, new RegExp(`data-shader-value="${c.key}"[^>]*>${lit(shown)}<`), `${c.key}: shown`);
    } else if (c.kind === 'choice') {
      assert.match(html, new RegExp(`role="radiogroup" aria-labelledby="inv-shader-${c.key}-label"`), c.key);
      assert.match(html, new RegExp(`id="inv-shader-${c.key}-label"[^>]*>${lit(c.label)}<`), c.key);
      for (const o of /** @type {any[]} */ (c.options)) {
        const radio = new RegExp(`<input type="radio" name="inv-shader-${c.key}" value="${o.value}"[^>]*>`).exec(
          html,
        )?.[0];
        assert.ok(radio, `${c.key} ${o.value}`);
        assert.equal(/ checked/.test(radio), o.value === v, `${c.key} ${o.value}: checked as the style has it`);
      }
    } else {
      const box = new RegExp(`<input type="checkbox" role="switch" data-shader="${c.key}"[^>]*>`).exec(html)?.[0];
      assert.ok(box, `${c.key}: a switch`);
      assert.equal(/ checked/.test(box), v === true, c.key);
    }
  }
  // The style's own values: Default checked, Custom there but not to pick, nothing to reset.
  assert.match(html, /value="default" data-look="style" checked/);
  assert.match(html, /value="custom" data-look="style" disabled/);
  assert.match(html, /<button type="button" class="inv-btn[^"]*" data-shader-reset disabled>Reset To Style<\/button>/);
  const custom = sheetHtml(validLook({ ...DEFAULT_LOOK, shader: { levels: 8 } }));
  assert.match(custom, /value="custom" data-look="style" checked>/, 'a change of the user’s: Custom');
  assert.doesNotMatch(custom, /value="default" data-look="style" checked/);
  assert.match(custom, /data-shader-reset>Reset To Style</);
  assert.match(custom, /data-shader-value="levels"[^>]*>8</);
  // At Off the pixel look's controls rest (with a line saying why); toon shading, the shadow's
  // strength and the light still apply.
  const off = sheetHtml({ ...DEFAULT_LOOK, pixelSize: 'off' });
  for (const c of SHADER_CONTROLS) {
    const tags = [...off.matchAll(new RegExp(`<input[^>]*data-shader="${c.key}"[^>]*>`, 'g'))].map((m) => m[0]);
    assert.ok(tags.length > 0, c.key);
    for (const tag of tags) assert.equal(/ disabled/.test(tag), c.pixelOnly, `${c.key} at Off`);
  }
  assert.doesNotMatch(off, /data-shader-off-hint hidden/);
  assert.match(html, /data-shader-off-hint hidden/);
  // Dithering off: its strength rests. Outlines off: the lines' strength, colour and ring.
  const plain = sheetHtml({ ...DEFAULT_LOOK, dither: false, outlines: false });
  for (const c of SHADER_CONTROLS) {
    const tag = new RegExp(`<input[^>]*data-shader="${c.key}"[^>]*>`).exec(plain)?.[0] ?? '';
    assert.equal(/ disabled/.test(tag), Boolean(c.needs), `${c.key} with Dithering and Outlines off`);
  }
  // House rules: labels in Title Case, hints sentences of at most 160 characters, no title=.
  assert.doesNotMatch(html, /\stitle=/);
  for (const hint of [...html.matchAll(/class="inv-hint[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]))
    assert.ok(/^[A-Z].*\.$/.test(hint) && hint.length <= 160, hint);
  const labels = [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter((t) => t && !/[.:%°]/.test(t));
  for (const label of labels) assert.match(label, /^[A-Z0-9][^ ]*( [A-Z0-9][^ ]*)*$/, label);
});
