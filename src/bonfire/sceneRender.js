// How the picture is drawn, over the settings (effects.render): the render options Bonfire
// Live's Picture tab and the Painter set (setRender, the palette, the fog, the shadow, the
// x-ray views), the render target's size (a fixed on-screen pixel size: the target scales
// instead), the site's P menu (cycle, describe), and the breakdown ("How it's made": one of
// the passes in place of the picture, and the particle systems' counts).
import { effects } from '../effects.js';
import { base, flames, scenePalette, debugPalettes } from '../palette.js';
import { PIXEL_SIZES } from '../pixelSizes.js';
import { MODES } from './interaction.js';

const DEBUG_PALETTES = Object.keys(debugPalettes);
const DITHER_LEVELS = [0.08, 0.16, 0.26]; // (the render menu steps up through these from the current value, then to none)
const MATRIX_SIZES = [4, 8];

/** The value after `cur` in `list` going `dir` (wrapping; from one that isn't in it, the nearest that way). */
export const stepIn = (list, cur, dir) => {
  const i = list.indexOf(cur);
  if (i >= 0) return list[(i + dir + list.length) % list.length];
  const next = dir > 0 ? list.find((v) => v > cur) : list.findLast((v) => v < cur);
  return next ?? (dir > 0 ? list[0] : list.at(-1));
};

/**
 * The render options, the size, the P menu's steps and the breakdown.
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createSceneRender(ctx) {
  const {
    scope, container, renderer, canvas, scene, camera, frame, pass, fireLight, particleMaterial, flowView, interaction, pointer, view, siteKnight,
    fire, plasma, crystals, chill, swingTrail, debris,
  } = ctx;
  // --- Sizing (fixed on-screen pixel size; the render target scales instead)
  const settings = { pixelSize: null };
  ctx.size = { w: 1, h: 1, pd: 4 };
  const isSmall = () => container.clientWidth < 700;
  const pixelSize = () => settings.pixelSize ?? (isSmall() ? effects.render.pixelSizeSmall : effects.render.pixelSize);
  // --- Render options: the settings' own (effects.render), or absolute values over them
  // (the visualizer's Render tab: setRender, setPalette, setFog, setShadows, setXray). An
  // override stands until it's cleared, applyEffects (the admin preview) included; with
  // none set, everything is exactly as the settings say (the site never sets one).
  const renderOverride = {};
  // Settings read live where they're used (the flame's frame rate, how long a color change
  // takes, how hits land): an override writes through to them, and clearing it puts the
  // settings' own value back. (A value there that isn't the override's is the settings'
  // own: the admin preview replaced it.) The hit ones take true (the settings' own) or
  // false (none: the value after the name).
  /** @type {Record<string, [string, string, (number | boolean)?]>} */
  const WRITE_THROUGH = {
    flameFps: ['fire', 'fps'], colorChange: ['render', 'colorChange'],
    hitStop: ['impact', 'hitStop', 0], hitFlash: ['impact', 'flash', 0], debris: ['impact', 'debris', 0], marks: ['impact', 'marks', false],
  };
  const ownValues = {};
  function applyRender() {
    const r = { ...effects.render, ...renderOverride };
    pass.uniforms.ditherStrength.value = r.dither;
    pass.uniforms.ditherScale.value = r.ditherMatrix;
    pass.uniforms.outlines.value = r.outlines ? 1 : 0;
    pass.uniforms.vignette.value = r.vignette;
    pass.uniforms.exposure.value = r.exposure;
    for (const [key, [section, name]] of Object.entries(WRITE_THROUGH)) {
      const live = effects[section];
      if (key in renderOverride) {
        if (live[name] !== renderOverride[key]) ownValues[key] = live[name];
        live[name] = renderOverride[key];
      } else if (key in ownValues) {
        live[name] = ownValues[key];
        delete ownValues[key];
      }
    }
  }
  applyRender();
  /**
   * Render options over the settings, as a partial: a value sets one, null clears it back to
   * the settings', and anything left out stays as it is. dither (0..0.5), ditherMatrix (4 | 8),
   * outlines, vignette (0..1.5), exposure, colorChange (seconds), flameFps (the flame's
   * frame rate), pixelSize (CSS px, the same as setPixelSize but redrawn only when it
   * changes), and how hits land: hitStop (seconds of freeze), hitFlash (0..1), debris
   * (×), marks, each also true (the settings') or false (none).
   */
  function setRender(partial = {}) {
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined || key === 'pixelSize') continue;
      const off = WRITE_THROUGH[key]?.[2];
      const v = off !== undefined && typeof value === 'boolean' ? (value ? null : off) : value;
      if (v === null) delete renderOverride[key];
      else renderOverride[key] = v;
    }
    applyRender();
    if (partial.pixelSize !== undefined && (partial.pixelSize ?? null) !== settings.pixelSize) {
      settings.pixelSize = partial.pixelSize ?? null;
      resize();
    }
  }
  // The palette: null (the settings': the flame's own, which the debug HUD may cycle),
  // 'flame' (always the flame's own), a debug palette ('ashen', 'moonlit'), or a few of the
  // flame's own colors ([slot, …] of scenePalette, e.g. [0, 6, 8]), which follow the flame
  // as it changes (keepPalette, every frame).
  ctx.paletteOverride = null;
  const paletteIndex = (id) => Math.max(0, DEBUG_PALETTES.findIndex((n) => n.toLowerCase().startsWith(id)));
  // (A few colors are put over the palette again only when something they come from changed:
  // the slots, the flame's colors (applyColors, which puts the full palette back: fewStale),
  // or the scenery's (palette.js base). Not every frame.)
  let fewSlots = null;
  const fewBase = { void: '', shadow: '', stone: '', wood: '', bone: '' };
  function fewChanged(slots) {
    let changed = ctx.fewStale || slots !== fewSlots;
    for (const k in fewBase) if (fewBase[k] !== base[k]) { fewBase[k] = base[k]; changed = true; }
    ctx.fewStale = false;
    fewSlots = slots;
    return changed;
  }
  function keepPalette(force = false) {
    const p = ctx.paletteOverride;
    if (p === null) return;
    if (Array.isArray(p)) {
      if (!fewChanged(p) && !force) return;
      const all = scenePalette({ ramp: ctx.currentRamp, shade: ctx.currentShade });
      pass.setPalette(p.map((i) => all[i] ?? all[0]));
      return;
    }
    const index = paletteIndex(p);
    if (!force && index === ctx.debugPaletteIndex) return;
    ctx.debugPaletteIndex = index;
    if (index) pass.setPalette(debugPalettes[DEBUG_PALETTES[index]]);
    else ctx.applyColors({ ramp: ctx.currentRamp, shade: ctx.currentShade }, ctx.currentMix);
  }
  function setPalette(p = null) {
    const was = ctx.paletteOverride;
    const slots = Array.isArray(p) ? p.filter((i) => Number.isInteger(i) && i >= 0) : null;
    ctx.paletteOverride = slots ? (slots.length ? slots : null) : p ?? null;
    if (ctx.paletteOverride === null) {
      if (was !== null) { ctx.debugPaletteIndex = 0; ctx.applyColors({ ramp: ctx.currentRamp, shade: ctx.currentShade }, ctx.currentMix); }
      return;
    }
    // (A few of the flame's colors go over the flame's own palette, which stays the one
    // applyColors keeps, so going back to it is immediate.)
    if (slots) ctx.debugPaletteIndex = 0;
    keepPalette(true);
  }
  // Fog: the scene's own (light), none, or thick (near and far, meters from the camera).
  const FOGS = { light: [scene.fog.near, scene.fog.far], thick: [3.2, 8], off: [1000, 1001] };
  ctx.fogKind = 'light';
  function setFog(kind = 'light') {
    ctx.fogKind = FOGS[kind] ? kind : 'light';
    [scene.fog.near, scene.fog.far] = FOGS[ctx.fogKind];
  }
  /**
   * The fire's shadow on or off, only where shadows are drawn at all. Its strength, not
   * whether the light casts one: no shader changes (none is rebuilt), and while it's off the
   * shadow map isn't redrawn either (shadowNeedsUpdate), so it's lighter on the card.
   */
  ctx.shadowsOn = true;
  function setShadows(on = true) {
    if (!!on === ctx.shadowsOn) return;
    ctx.shadowsOn = !!on;
    fireLight.shadow.intensity = ctx.shadowsOn ? 1 : 0;
    if (ctx.shadowsOn) ctx.shadowFrames = Math.max(ctx.shadowFrames, 1); // (it's stale: redraw it now)
  }
  // X-ray (the visualizer): one of the passes the picture is built from, in place of the
  // scene but carried on through the effects and the palette (pixelPass.js uXray), or the
  // flow field over the fire. null: the picture.
  const XRAY = { normals: 1, lighting: 2, particles: 3, flow: 0 };
  ctx.xrayView = null;
  function setXray(view = null) {
    ctx.xrayView = view in XRAY ? view : null;
    pass.uniforms.uXray.value = XRAY[ctx.xrayView] ?? 0;
    flowView.visible = ctx.xrayView === 'flow';
  }
  function resize() {
    if (scope.disposed) return;
    const dpr = window.devicePixelRatio || 1;
    const cssPx = pixelSize();
    const pd = Math.max(1, Math.round(cssPx * dpr));
    const w = Math.max(1, Math.ceil((container.clientWidth * dpr) / pd));
    const h = Math.max(1, Math.ceil((container.clientHeight * dpr) / pd));
    ctx.size = { w, h, pd };
    frame.setSize(w, h, pd);
    // (Each size has its own targets, the color pass's depth among them: the particles, all
    // sharing this uniform, test themselves against the current one.)
    particleMaterial.uniforms.tDepth.value = frame.depthTexture;
    canvas.style.width = `${(w * pd) / dpr}px`;
    canvas.style.height = `${(h * pd) / dpr}px`;
    pointer.measure(canvas);
    camera.aspect = w / h;
    view.layout = container.clientWidth >= 1100 && w / h > 1.15 ? 'wide' : 'tall';
    fitKnights();
  }
  // The site's tall layout (a phone) frames his seat right under the page's header, with no
  // room over him to stand up in: the dance from the pack is danced in his seat there.
  function fitKnights() { if (ctx.knights && siteKnight) ctx.knights.headroom = view.layout === 'wide'; }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  scope.cleanup(() => observer.disconnect());

  // --- The render settings (the site's P menu, ui/renderMenu.js): cycle() steps one
  // setting on (dir 1) or back (-1, a Shift+click), describe() says what each is now.
  function cycle(what, dir = 1) {
    dir = dir < 0 ? -1 : 1;
    if (what === 'pixel') {
      settings.pixelSize = stepIn(PIXEL_SIZES, pixelSize(), dir);
      resize();
    } else if (what === 'palette') {
      ctx.debugPaletteIndex = (ctx.debugPaletteIndex + dir + DEBUG_PALETTES.length) % DEBUG_PALETTES.length;
      const debug = debugPalettes[DEBUG_PALETTES[ctx.debugPaletteIndex]];
      pass.setPalette(debug ?? scenePalette({ ramp: ctx.currentRamp, shade: flames[ctx.flameKey].shade }), { steel: !debug });
      ctx.fewStale = true;
    } else if (what === 'dither') {
      // (Up a level from what's showing now, the settings' own included, then back to none;
      // back, down a level from it, from none to the strongest.)
      const cur = pass.uniforms.ditherStrength.value;
      pass.uniforms.ditherStrength.value = dir > 0
        ? DITHER_LEVELS.find((v) => v > cur + 1e-4) ?? 0
        : cur > 1e-4 ? DITHER_LEVELS.findLast((v) => v < cur - 1e-4) ?? 0 : DITHER_LEVELS.at(-1);
    } else if (what === 'matrix') {
      pass.uniforms.ditherScale.value = stepIn(MATRIX_SIZES, pass.uniforms.ditherScale.value, dir);
    } else if (what === 'interaction') {
      const keys = Object.keys(MODES);
      interaction.mode = keys[(keys.indexOf(interaction.mode) + dir + keys.length) % keys.length];
    } else if (what === 'outlines') {
      pass.uniforms.outlines.value = pass.uniforms.outlines.value ? 0 : 1;
    }
    return describe();
  }
  /** The values as the menu shows them (Title Case, as its options are: "Off", "Ashen (3 Colors)"). */
  function describe() {
    return {
      pixel: `${pixelSize()} px (${ctx.size.w}×${ctx.size.h})`,
      palette: ctx.debugPaletteIndex === 0 ? flames[ctx.flameKey].name : DEBUG_PALETTES[ctx.debugPaletteIndex].replace(/(\d) color\)$/, '$1 Colors)'),
      dither: pass.uniforms.ditherStrength.value ? pass.uniforms.ditherStrength.value.toFixed(2) : 'Off',
      matrix: `${pass.uniforms.ditherScale.value}×${pass.uniforms.ditherScale.value}`,
      outlines: pass.uniforms.outlines.value ? 'On' : 'Off',
      interaction: MODES[interaction.mode].name,
    };
  }

  // --- Breakdown mode (the site's "How it's made"): the final image, or one of the passes
  // it's built from, and the flow field drawn over the fire.
  const VIEWS = { final: 0, normals: 1, color: 2, particles: 3, flow: 0 };
  function breakdown(view = 'final') {
    pass.uniforms.uView.value = VIEWS[view] ?? 0;
    flowView.visible = view === 'flow';
  }
  // Particle systems, for the breakdown's counts: the scene's point sets grouped by name.
  const named = (objects, name) => { for (const o of objects) if (o?.isPoints) o.name = name; };
  named([fire.flame], 'Bonfire flames');
  named([fire.spark], 'Bonfire sparks');
  named(plasma.objects, 'Lightning ball');
  named(crystals.objects, 'Frost motes');
  named([chill.points], 'Cold mist');
  named(swingTrail.objects, 'Blade trail');
  named(Object.values(debris).map((d) => d.points), 'Debris');
  function stats() {
    const systems = new Map();
    scene.traverse((o) => {
      if (!o.isPoints || !o.name) return;
      const size = o.geometry.attributes.size.array;
      let live = 0;
      for (let i = 0; i < size.length; i++) if (size[i] > 0) live++;
      const s = systems.get(o.name) ?? { name: o.name, live: 0, total: 0 };
      s.live += live;
      s.total += size.length;
      systems.set(o.name, s);
    });
    // (The site's one knight is a row of the breakdown's own; Bonfire Live's cast counts here.)
    if (ctx.knights && !siteKnight) systems.set('Knights', { name: 'Knights', live: ctx.knights.present, total: ctx.knights.max });
    return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, texels: `${ctx.size.w}×${ctx.size.h}`, systems: [...systems.values()] };
  }
  return { settings, renderOverride, pixelSize, applyRender, setRender, setPalette, setFog, setShadows, setXray, keepPalette, resize, fitKnights, cycle, describe, breakdown, named, stats };
}
