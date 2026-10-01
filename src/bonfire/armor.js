// The knight's armor: plate by firelight, drawn like a sprite, in one of his styles.
//
// One Phong material (flat shaded) for every part of a knight; the part's role (plate,
// edge, trim, mail, leather, cloth, the void behind the eye slits) rides on each vertex
// (`aRole`, from the model's material names), so a whole knight is one draw call.
//
// The style (knightStyles.js; setStyle, the shader's uLook) picks how he is drawn:
//   1..3 the pixel styles (cel, the default; painterly; chiaroscuro): a hand-drawn sprite,
//                        not a render. Each plate is one smooth, rounded surface (`aSmooth`:
//                        its corners' normals averaged over the plate, turned a little
//                        toward the plates beyond at its creases; knights.js), cut into a few
//                        flat bands by the fire's key light (the fire lifted to its flames'
//                        body; Lambert, falling off steeply with distance, kept out of the
//                        gaps: `aOcc`, how buried a corner is under the helm, the pauldrons,
//                        the overlaps). Only a plate squarely facing the fire leaves the
//                        steel: the finish's cool greys hold the shadows and the mids, the
//                        flame's body and its cream tips are the lit bands (steel.js
//                        celRamp), so he reads as grey plate lit by that fire and recolors
//                        with every flame; the far side falls to shadow (the moon's and the
//                        sky's dim fill) and near-black. A plate that isn't a ring round a
//                        limb (a pauldron's dome, a helmet's crown, a lame: aPatch.w, its
//                        flatness) is curved metal: the light across it steeper, so it goes
//                        from a lit crescent where it turns squarely to the fire through
//                        steel and mids to a dark far side, a band darker where it mirrors
//                        the sky, never one flat disc of the flame's color. The highlight: a
//                        crescent where a rounded plate faces the fire and turns from the
//                        camera, a small glint where it mirrors it, the heart of a curved
//                        plate's lit crescent; the raised edges the fire lights catch it a
//                        band up. The flame flashes in a plate facing it as a whole
//                        (its mean normal, `aPatchN`: into the lit bands, never on the far
//                        side), the sweeps glide over the plates the same way. Each smooth
//                        surface marks its id (`aPatch`) with its pixels, and the pass draws
//                        the line art: one texel wherever two meet on screen (every plate
//                        edge, crease and overlap; a slight surface small on screen takes its
//                        neighbour's id, so a gauntlet's fingers or a fauld's hoops aren't a
//                        scribble far off), the fire's color just inside his outline on the
//                        fire's side (pixelPass.js). The band edges are dithered: near one,
//                        each texel's ordered threshold (the pass's own Bayer matrix, texel
//                        for texel with the scene's) steps the wider band's texels across
//                        into the narrower, so the band breaks into the next in the scene's
//                        pattern and a thin one grows teeth rather than breaking up (the lit
//                        bands always step down into the steel); how far follows the Dither
//                        setting (uDither, uDitherScale: the pass's own, shared) times the
//                        style's amount (uCelDither, knightStyles.js), and a band too thin on
//                        screen gives up none (no speckle on a limb).
//                        cel: four bands and a highlight, near-black ink (a dark warm ink over
//                        the lit tones). painterly: shadows hue-shifted toward the flame's
//                        shade, lips a little further round, a lighter ink over the lit
//                        tones, the flame's dark shade on the terminator. chiaroscuro: a
//                        hard key, three bands (the dark, mid steel, the fire's body) and the
//                        highlight, near-black backs, black ink, a little dither.
//   0 gunmetal           round 9's first look: natural light on gunmetal steel (below: the
//                        rest of this header)
//   4 blackgold          round 8's: blackened plate in the scene's stone, shadow and void by
//                        each facet's turn to the fire, dark gilt trim (K_Trim) in wood and
//                        shadow that catches the flame's mid, hi and core only in its
//                        reflection, rims a step up; no steel ramp, no fire rim.
//   5 first              round 8's first build (its own model): the same blackened plate, the
//                        trim at least the flame's lo, so it glows in the flame's color.
// Every style keeps the fire's reflection, the sweeps, the glints, the dissolve, the frost
// and the hover rim; a flash as he forms or takes a new helmet (uLift) lifts his own tones.
//
// Gunmetal: steel is drawn in a ramp of its own (steel.js FINISHES: five greys, dark to
// light, the finish's; the scene's palette has no mid greys): the pixel pass snaps his steel
// pixels to it, never to the scenery's stone (pixelPass.js setSteel). The light walks a facet
// up that ramp the way light really falls on a knight by a fire:
//   the fire    a point light: each facet takes it by its turn to the fire (Lambert: the
//               cosine to the light) and its distance (falling off away from it), so the
//               side facing the fire is the brightest, it fades across the turning edge,
//               and the back gets no firelight at all. The strength is the fire's light
//               now, smoothed and floored (step()), so a forge's dip dims him a little and
//               never flattens him, and a stoke brightens him at once.
//   the back    only the cold sky and the moon (a dim fill: the ramp's darkest tones), and
//               the void where nothing reaches.
//   metal       is mostly reflection: a broad sheen where the facet mirrors the fire toward
//               the camera (Blinn-Phong, a step or two up the ramp), and a faked
//               environment: a facet mirroring the ground near the fire takes its warm dark
//               (the flame's `shade`), one mirroring the sky stays cold and dark.
//   the rim     his silhouette's edge catches the fire's color (Fresnel: metal mirrors most
//               at grazing angles): the flame's `lo` on the fire's side, its dark `shade` on
//               the far side, a pixel in from the outline, subtly (setRim: 0 none, 1 wider
//               and brighter). The pass draws it, where the silhouette is known (the depth
//               edges); each steel facet marks which side of him it's on.
//   wear        each plate a touch lighter or darker than its neighbours (a piece id from
//               the model's connected parts, knights.js), the raised rims and ridges worn
//               bright, the undersides where plates overlap a step down: the pixel-art
//               texture of plate, at the scale of the plates (a fine texture only crawls).
// Each facet lands on one of the ramp's tones, flat; one the light puts right between two
// dithers between them (the last quarter of each step), so a big plate turning away shades
// off in a few pixels of dither, not a hard line. Fog takes him smoothly down the ramp.
//   the fire's reflection
//            the cool part: each facet's mirror ray (seen from his chest, so a facet
//            flashes whole) is traced against the flame itself, a column over the fire
//            that sways, jitters with each flicker and swells with its light, and the few
//            facets whose mirror passes through it flash the flame's `hi`, near its base
//            its `core`. As the flames sway and flicker and he breathes or moves, the
//            flashes jump from facet to facet in crisp steps (at the fire's 12 fps): a
//            sparse sweep across polished plate, never a glow. Other lights (a firefly,
//            a ring racing by, a lamp) glint the same way off the facets that mirror them.
//   sweeps   when the fire flares (a stoke, the cursor on the fire, an impact, a weapon
//            forming, a ring) its reflection sweeps across the whole armor: a band of
//            facets, the fire's `core` on its leading edge and `hi` behind it, rolls out
//            from the facets that mirror the fire to those turned furthest from it, and
//            fades as it goes (~0.6–0.95 s; flare()). At rest a gentler band (in `hi`) runs
//            over him now and then, out from the fire, up from below or across, so the big
//            planes (the pauldron domes, the helmet's face, the breastplate, the cuisses)
//            take their turn too. Each facet is in the band or not by its turn alone (its
//            mirror seen from his chest), so it flashes whole, and the band steps at the
//            fire's 12 fps.
//   a beat   uGlint widens the flame's reflection for a moment: more facets flash.
//   creases  he marks himself in the color buffer's alpha (the scenery's is 1): steel with
//            its tone, so the pixel pass snaps it to the steel ramp and draws his crease
//            lines a tone down that ramp (pixelPass.js ARMOR_MARK), not the scenery's
//            brighter, brownish line; anything else of his (the fire in his plate, the rim,
//            leather) with a mark of its own, snapped to the palette as it is.
// Finishes (setFinish): gunmetal (the default), blackened, polished steel, burnished; each
// its ramp, how far up it sits and how strongly it mirrors (steel.js FINISH_LOOK); the pixel
// styles draw their shadows and mids in its own steel (steel.js CEL_STEEL: near-black,
// cool grey, bright silver, warm bronze), a clearly different plate each.
// Leather keeps its own dark tones (the belt in wood); cloth (the helmets' insides, the
// joints' dark cores) stays in void and shadow.
//
// Mail gets an object-space pattern of rings (rows 3.3 cm apart, offset each row): the
// gaps a tone darker, so it reads as mail and not a flat blob; it's in the model's rest
// space, so it moves with him. Mail is duller than plate (no sheen or mirror).
//
// Summoning, dismissing and the helmet swap burn through the armor with the weapons'
// dissolve (dissolve.js): noise over the rest-space height, a screen-locked dither, a
// two-tone ember edge; uFrost glazes him in ice from the feet up (the ice element's
// arrival), like the weapon's frost. While a knight dissolves the caller moves him to the
// ghost layer (no outline or shadow of the holes).
import * as THREE from 'three';
import { DISSOLVE_CHUNK } from './dissolve.js';
import { base, mixHex } from '../palette.js';
import { FINISH_LOOK, finishOr, litRamp, celRamp } from './steel.js';
import { STYLES, CEL_LOOKS, styleOr } from './knightStyles.js';

/**
 * The model's material names, in role order (the shader's role index). K_Trim is round 8's
 * gilt: only the black-and-gold styles draw it as trim, the rest as raised steel (K_Edge).
 */
export const ROLES = ['K_Plate', 'K_Edge', 'K_Trim', 'K_Mail', 'K_Leather', 'K_Cloth', 'K_Void'];
/** A material name's role index (unknown names are plate). */
export const roleOf = (name) => Math.max(0, ROLES.indexOf(name));

/** The least of the fire's light the armor sees (1 = its resting glow): a forge's dip only dims him. */
export const FIRE_FLOOR = 0.8;

/**
 * The uniforms every knight shares (one set, updated once a frame).
 * @param {object} o
 * @param {THREE.Vector3} o.fireAt   the fire light's position (world; kept by reference, so
 *                                   the reflection follows the lightning ball)
 * @param {{ value: number }} o.exposure  the pixel pass's exposure uniform (shared)
 * @param {THREE.Vector3} [o.moonAt] where the moonlight comes from (world direction)
 * @param {boolean} [o.reducedMotion]  no sweeps (the reflection still follows the flames)
 * @param {string} [o.finish]        steel.js FINISHES key ('gunmetal')
 * @param {number} [o.rim]           the fire's rim on his edges, 0..1 (0.5)
 * @param {string} [o.style]         knightStyles.js STYLES key (its default)
 * @param {(steel: string[], rim: number, o: { lines: number, terminator: number }) => void} [o.onSteel]
 *                                   the colors his steel snaps to, the rim or the line art
 *                                   changed (the pixel pass's setSteel: [] for the styles drawn
 *                                   in the scene's own palette; `lines` 1 the pixel styles' line
 *                                   art, 0 none; `terminator` where they draw it: 0 nowhere,
 *                                   1 where a lit band meets the dark steel)
 * @param {{ value: THREE.Vector2 }} [o.resolution]  the pixel pass's size (texels; kept by
 *                                   reference): how big his plates are drawn
 * @param {{ value: number }} [o.dither]       the pixel pass's dither strength (shared, like
 *                                   the exposure): the pixel styles dither their band edges
 *                                   with it (0 none; the site's 0.08 the style's own amount)
 * @param {{ value: number }} [o.ditherScale]  ...and its matrix (shared: 4 or 8)
 */
export function createArmorShared({ fireAt, exposure, resolution = { value: new THREE.Vector2(640, 360) }, dither = { value: 0.08 }, ditherScale = { value: 4 }, moonAt = new THREE.Vector3(-3, 5, -4), reducedMotion = false, finish = 'gunmetal', rim = 0.5, style = undefined, onSteel = null }) {
  const uniforms = {
    uFireWorld: { value: fireAt },
    uFire: { value: 1 },       // the fire's light now, 1 = its resting glow
    uFireLit: { value: 1 },    // ...as the armor is lit by it (smoothed and floored: step())
    uTime: { value: 0 },       // seconds (the flames' sway in the reflection; knights.js keeps it)
    uExposure: exposure,
    uRes: resolution,          // the pixel pass's size (texels; shared): how big a plate is on screen
    uDither: dither,           // the pass's dither strength (shared): the pixel styles' band edges follow it
    uDitherScale: ditherScale, // ...and its Bayer matrix (shared: 4 or 8)
    uLo: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHi: { value: new THREE.Color() }, uCore: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
    uVoid: { value: new THREE.Color() }, uShadow: { value: new THREE.Color() }, uStone: { value: new THREE.Color() }, uWood: { value: new THREE.Color() },
    uSteel: { value: Array.from({ length: 5 }, () => new THREE.Color()) }, // (linear, dark to light)
    uLook: { value: 0 },       // the style's look (knightStyles.js): 0 gunmetal, 1..3 the pixel styles, 4 blackgold, 5 first
    uCel: { value: Array.from({ length: 8 }, () => new THREE.Color()) },   // the pixel styles' tones (steel.js CEL_TONES, linear)
    uCelDither: { value: 0 },  // ...how far they dither across their band edges (the style's: knightStyles.js dither)
    uKeyLift: { value: 0.4 },  // the pixel styles' key light: the fire lifted to its flames' body (m)
    uBias: { value: 0 },       // the finish: tones up (or down) its ramp
    uPolish: { value: 1 },     // ...and how strongly it mirrors
    uMoonDir: { value: moonAt.clone().normalize() },
    uGlint: { value: 0 },      // a beat: the flame's reflection widens for a moment
    uReflect: { value: 1 },    // how strongly the plate mirrors the fire (0: not at all)
    // The sweep: x its front and y its half-width (radians from its axis, measured on each
    // facet's mirror), z its strength 0..1, w 1 when its leading edge is the flame's core.
    uSweep: { value: new THREE.Vector4(0, 0.3, 0, 0) },
    // ...and its axis: xyz, w 0 a world direction, 1 the fire's (from his chest), 2 a view one.
    uSweepAxis: { value: new THREE.Vector4(0, 0, 0, 1) },
  };
  // --- the style, the finish and the colors his steel is drawn in: the finish's ramp by the
  // fire's light (steel.js litRamp), the pixel styles' six tones (celRamp), or none (the
  // black-and-gold styles are drawn in the scene's own palette)
  const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  const look = { style: styleOr(style), finish: finishOr(finish), light: null, mix: 0.34, steel: [], rim: clamp01(rim), flame: { ramp: [], shade: undefined }, sent: '' };
  const lookOf = () => STYLES[look.style].look;
  function writeSteel() {
    const lk = lookOf();
    uniforms.uLook.value = lk;
    uniforms.uCelDither.value = STYLES[look.style].dither;
    const steelRamp = litRamp(look.finish, look.light);
    steelRamp.forEach((h, i) => uniforms.uSteel.value[i].set(h));
    const cel = CEL_LOOKS[lk] ? celRamp(CEL_LOOKS[lk], look.finish, { ...look.flame, light: look.light ?? undefined }) : null;
    if (cel) cel.forEach((h, i) => uniforms.uCel.value[i].set(h));
    look.steel = lk === 0 ? steelRamp : cel ?? [];
    const f = FINISH_LOOK[look.finish];
    uniforms.uBias.value = f.bias;
    uniforms.uPolish.value = f.polish;
    const rimNow = lk >= 4 ? 0 : look.rim;
    const lines = cel ? 1 : 0;
    // (The painterly and chiaroscuro styles' warm edge between the light and the dark steel.)
    const terminator = lk === 2 || lk === 3 ? 1 : 0;
    // (Only what changed goes on to the pass.)
    const key = `${look.steel.join()}|${rimNow}|${lines}|${terminator}`;
    if (key === look.sent) return;
    look.sent = key;
    onSteel?.([...look.steel], rimNow, { lines, terminator });
  }
  writeSteel();
  // --- the fire's light as he's lit by it: floored, and smoothed (rises fast, falls slowly)
  let lit = 1;
  // --- sweeps (see the header): one at a time, stepped at 12 fps
  const shine = { rest: true, flares: true };
  let sweep = null; // { kind, level, t, dur, s, hot, from, to, w, axis: [x, y, z, w] }
  let restIn = 1.5 + Math.random() * 2;
  const REST_AXES = [[0, 0, 0, 1], [0, 0, 0, 1], [0, -1, 0, 0], [-1, 0, 0, 2], [1, 0, 0, 2]];
  function begin(o) {
    sweep = { t: 0, ...o };
    uniforms.uSweepAxis.value.set(...o.axis);
  }
  function write() {
    const u = uniforms.uSweep.value;
    if (!sweep) { u.z = 0; return; }
    const t = Math.floor(sweep.t * 12) / 12; // (stepped, like the flames)
    const k = Math.min(1, t / sweep.dur);
    u.x = sweep.from + (sweep.to - sweep.from) * (sweep.kind === 'flare' ? 1 - (1 - k) ** 1.6 : k); // (a flare bursts out, then slows)
    u.y = sweep.w;
    // A flare hits at once and fades as it goes; a rest sweep comes and goes.
    u.z = sweep.kind === 'flare' ? sweep.s * (1 - k) ** 0.5 : sweep.s * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.5;
    u.w = sweep.hot ? 1 : 0;
  }
  return {
    uniforms,
    /**
     * The fire flared (`strength` 0..1: a stoke or an impact 1, a ring or the cursor on the
     * fire a little less): its reflection sweeps across the armor. A stronger flare takes
     * over a weaker one still running.
     */
    flare(strength = 1) {
      if (reducedMotion || !shine.flares) return;
      const s = Math.min(1, Math.max(0, strength));
      if (sweep?.kind === 'flare' && sweep.t < 0.2 && sweep.level >= s) return;
      begin({ kind: 'flare', level: s, dur: 0.6 + 0.35 * s, s: 0.55 + 0.45 * s, hot: s > 0.35, from: 0, to: 3, w: 0.2 + 0.1 * s, axis: [0, 0, 0, 1] });
      restIn = Math.max(restIn, 2.5);
    },
    /** Which sweeps run: `rest` (now and then, at rest) and `flares` (the fire flaring). */
    setShine({ rest = shine.rest, flares = shine.flares } = {}) {
      shine.rest = !!rest;
      shine.flares = !!flares;
      if (sweep && !shine[sweep.kind === 'flare' ? 'flares' : 'rest']) sweep = null;
      write();
    },
    get shine() { return { ...shine }; },
    /** The style (knightStyles.js STYLES; anything else the default): how the shader draws him. The model is knights.js's. */
    setStyle(name) {
      const s = styleOr(name);
      if (s === look.style) return;
      look.style = s;
      writeSteel();
    },
    get style() { return look.style; },
    /** The finish (steel.js FINISHES: 'gunmetal', 'blackened', 'polished', 'burnished'; anything else gunmetal). */
    setFinish(name) {
      const f = finishOr(name);
      if (f === look.finish) return;
      look.finish = f;
      writeSteel();
    },
    get finish() { return look.finish; },
    /** The fire's color on his silhouette (the pass draws it, pixelPass.js): 0 none, 0.5 subtle (the default), wider and brighter at every step up to 1 (three texels, the flame's hi, the pixel styles' outline glowing on the fire's side). */
    setRim(v) {
      const r = clamp01(v);
      if (r === look.rim) return;
      look.rim = r;
      writeSteel();
    },
    get rim() { return look.rim; },
    /** The colors his steel is drawn in now (sRGB hexes, dark to light: the finish by the fire's light, the pixel styles' six tones, or none). */
    get steel() { return [...look.steel]; },
    /** Advance the sweeps and the light he's lit by (s of simulation time; knights.js, every frame). */
    step(dt) {
      const want = Math.max(FIRE_FLOOR, Math.min(1.6, uniforms.uFire.value));
      lit += (want - lit) * (1 - Math.exp(-Math.max(0, dt) / (want > lit ? 0.08 : 0.6)));
      uniforms.uFireLit.value = lit;
      if (sweep) { sweep.t += dt; if (sweep.t >= sweep.dur) sweep = null; }
      if (!sweep && shine.rest && !reducedMotion && (restIn -= dt) <= 0) {
        restIn = 4 + Math.random() * 4;
        const axis = REST_AXES[Math.floor(Math.random() * REST_AXES.length)];
        // (Out from the fire, up from below or across: each runs over the whole of him.)
        begin({ kind: 'rest', dur: 1.1 + Math.random() * 0.4, s: 0.6, hot: false, from: -0.2, to: axis[3] === 1 ? 2.8 : 3.1, w: 0.12, axis });
      }
      write();
    },
    /**
     * The flame's ramp, [lo, mid, hi, core] (sRGB hex), and optionally its `shade` and how far
     * its cast light is washed toward white (`mix`, flames' `light`); left out, they stay as
     * they were. The scenery's darks come from the palette; the steel's lit tones lean
     * toward the fire's light.
     */
    setRamp(ramp, { shade, mix } = {}) {
      uniforms.uLo.value.set(ramp[0]);
      uniforms.uMid.value.set(ramp[1]);
      uniforms.uHi.value.set(ramp[2]);
      uniforms.uCore.value.set(ramp[3]);
      if (shade) uniforms.uShade.value.set(shade);
      else if (!look.light) uniforms.uShade.value.set(base.shadow);
      uniforms.uVoid.value.set(base.void);
      uniforms.uShadow.value.set(base.shadow);
      uniforms.uStone.value.set(base.stone);
      uniforms.uWood.value.set(base.wood);
      if (Number.isFinite(mix)) look.mix = mix;
      look.light = mixHex(ramp[1], '#ffffff', look.mix);
      look.flame = { ramp: [...ramp], shade: shade ?? look.flame.shade };
      writeSteel();
    },
  };
}

/**
 * A knight's armor material: the shared uniforms plus its own (userData.uniforms):
 * uDissolve 0..1 (burnt away from the feet up; uFlip 1 from the top down), uEdge and
 * uEdgeHot (the ember edge), uSpan (the rest-space heights the dissolve runs over), uGlow
 * (a wash of the edge color as he forms: the forge's lightning), uLift 0..1 (a flash in his
 * own tones, fading: he formed, a new helmet; his style's bands or steel lifted, never a
 * flat cut-out in one color), uFrost 0..1 and uFrostColor (an ice glaze
 * creeping up from the feet, or down with uFlip), uHover (a warm rim: the cursor's on him)
 * and uCenter (where his chest is, world: knights.js keeps it, for the fire's reflection).
 * Its geometry carries, per vertex, aRole, aPiece, and for the pixel styles aSmooth (the
 * plate's smooth normal), aPatchN (its smooth surface's mean normal), aPatch (that surface's
 * id 0..63, the id it takes small on screen, its size in m) and aOcc (how buried the corner
 * is, 0..1): knights.js.
 */
export function createArmorMaterial(shared, { span = [0, 1.78] } = {}) {
  const own = {
    uDissolve: { value: 0 }, uFlip: { value: 0 }, uEdge: { value: new THREE.Color() }, uEdgeHot: { value: new THREE.Color() },
    uSpan: { value: new THREE.Vector2(span[0], span[1]) }, uGlow: { value: 0 }, uLift: { value: 0 }, uHover: { value: 0 },
    uFrost: { value: 0 }, uFrostColor: { value: new THREE.Color('#e8f4ff') },
    uCenter: { value: new THREE.Vector3() }, // (world: where he is, for the flame's reflection)
  };
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 24, flatShading: true });
  mat.name = 'KnightArmor';
  mat.userData.uniforms = own;
  mat.customProgramCacheKey = () => 'knight-armor-8';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared.uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aRole;
        attribute float aPiece;
        attribute vec3 aSmooth;
        attribute vec3 aPatchN;
        attribute vec4 aPatch;
        attribute float aOcc;
        uniform vec2 uRes;
        varying float vRole;
        varying float vPiece;
        varying vec3 vRest;
        varying vec3 vRestN;
        varying vec3 vSmoothN;
        varying vec3 vPatchN;
        varying vec4 vPatch;
        varying float vOcc;
        varying float vPx;`)
      // (The plate's smooth normal, skinned and into view space like the normal.)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        vec3 aSm = aSmooth;
        #ifdef USE_SKINNING
          aSm = (skinMatrix * vec4(aSm, 0.0)).xyz;
        #endif
        vSmoothN = normalMatrix * aSm;
        vec3 aPn = aPatchN;
        #ifdef USE_SKINNING
          aPn = (skinMatrix * vec4(aPn, 0.0)).xyz;
        #endif
        vPatchN = normalMatrix * aPn;
        vPatch = aPatch;
        vOcc = aOcc;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;\nvRestN = normal;\nvRole = aRole;\nvPiece = aPiece;')
      // (Texels a meter on screen there: how big his plates are drawn.)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPx = projectionMatrix[1][1] * uRes.y * 0.5 / max(-mvPosition.z, 0.05);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vRole;
        varying float vPiece;
        varying vec3 vRest;
        varying vec3 vRestN;
        varying vec3 vSmoothN;
        varying vec3 vPatchN;
        varying vec4 vPatch;
        varying float vOcc;
        varying float vPx;
        uniform vec3 uFireWorld; uniform float uFire; uniform float uFireLit; uniform float uTime; uniform float uExposure;
        uniform vec3 uLo; uniform vec3 uMid; uniform vec3 uHi; uniform vec3 uCore; uniform vec3 uShade;
        uniform vec3 uVoid; uniform vec3 uShadow; uniform vec3 uStone; uniform vec3 uWood;
        uniform vec3 uSteel[5];
        uniform float uLook; uniform vec3 uCel[8]; uniform float uKeyLift;
        uniform float uDither; uniform float uDitherScale; uniform float uCelDither;
        uniform float uBias; uniform float uPolish;
        uniform vec3 uMoonDir; uniform float uGlint; uniform float uReflect;
        uniform vec4 uSweep; uniform vec4 uSweepAxis;
        uniform float uDissolve; uniform float uFlip; uniform vec3 uEdge; uniform vec3 uEdgeHot; uniform vec2 uSpan;
        uniform float uGlow; uniform float uLift; uniform float uHover; uniform vec3 uCenter; uniform float uFrost; uniform vec3 uFrostColor;
        // Per role (plate, edge, trim [drawn as edge but in the black-and-gold styles], mail,
        // leather, cloth, void): the other lights' glints (Phong), and how readily the facet
        // mirrors (its polish).
        const vec3 R_SPEC[7] = vec3[7](vec3(0.08), vec3(0.1), vec3(0.14), vec3(0.03), vec3(0.0), vec3(0.0), vec3(0.0));
        const float R_SHINE[7] = float[7](40.0, 30.0, 24.0, 12.0, 4.0, 3.0, 1.0);
        const float R_POLISH[7] = float[7](1.0, 1.15, 1.3, 0.0, 0.0, 0.0, 0.0);
        // The last part of each step up the ramp that dithers into the next (the rest is flat).
        const float BLEND = 0.25;
        // The pixel styles' rounded plates: the light steepened by ROUND_GAIN about ROUND_PIVOT
        // (of the key at full strength), ROUND_SKY off where they mirror the sky, the highlight
        // past ROUND_HOT.
        const float ROUND_PIVOT = 0.85;
        const float ROUND_GAIN = 2.0;
        const float ROUND_SKY = 0.2;
        const float ROUND_HOT = 1.1; // (the heart of its lit crescent: its small highlight)
        // The pixel styles' dithered band edges: how far a texel's Bayer threshold thr moves a
        // value v (the key, the fill, the turn) across the edge e nearest it, between a band wd
        // wide below it and wu above (in v's units), where v changes vw a texel (its
        // gradient's length: texels straight across the edge, whichever way it runs on
        // screen). Only one band's texels step across, into the other (up: the band below the
        // edge's; the caller picks: the wider band's), so a thin band is never broken into
        // dots, only toothed. a is the style's amount at this Dither: the window takes that
        // share of twice the band stepped into (all of it at most: a texel lands in it, never
        // past it) and at most a * reach texels (celReach); none from a band under DITHER_MIN
        // texels across (a thin limb's bands stay flat), fading in over a texel more, so a
        // band widening as he turns doesn't pop.
        const float DITHER_MIN = 2.0;
        float celDither(float v, float vw, float e, float wd, float wu, bool up, float thr, float a, float reach) {
          if (up ? (v >= e || thr <= 0.0) : (v < e || thr >= 0.0)) return 0.0;
          vw = max(vw, 1e-4);
          return thr * smoothstep(DITHER_MIN, DITHER_MIN + 1.0, (up ? wd : wu) / vw) * min(min(a, 1.0) * 2.0 * (up ? wu : wd), a * reach * vw);
        }
        // ...the reach, in texels: DITHER_MAX on a knight drawn up to DITHER_PX texels a
        // metre (the site's home view at 1920 and anything smaller), a little less as he's
        // drawn bigger, down to 3.4 (more of his bands are wide enough to dither there, and
        // their dots would add up to speckle).
        const float DITHER_MAX = 4.6;
        const float DITHER_PX = 87.0;
        float celReach(float px) { return clamp(DITHER_MAX * DITHER_PX / max(px, 1.0), 3.4, DITHER_MAX); }
        // The steel ramp's tone i (-1: the void).
        vec3 aSteel(int i) {
          vec3 c = uVoid;
          if (i == 0) c = uSteel[0];
          else if (i == 1) c = uSteel[1];
          else if (i == 2) c = uSteel[2];
          else if (i == 3) c = uSteel[3];
          else if (i >= 4) c = uSteel[4];
          return c;
        }
        // The pixel styles' tone i (0 deep .. 5 highlight).
        vec3 aCel(int i) {
          vec3 c = uCel[0];
          if (i == 1) c = uCel[1];
          else if (i == 2) c = uCel[2];
          else if (i == 3) c = uCel[3];
          else if (i == 4) c = uCel[4];
          else if (i >= 5) c = uCel[5];
          return c;
        }
        ${DISSOLVE_CHUNK}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        int role = int(vRole + 0.5);
        int look = int(uLook + 0.5);
        if (role == 2 && look < 4) role = 1; // (round 8's gilt: raised steel, but in the black-and-gold styles)
        diffuseColor.rgb = vec3(0.01);
        float aLink = 1.0;
        if (role == 3) {
          // Mail: rows of rings, each row offset by half a ring.
          vec3 mq = vRest * 30.0;
          float ring = fract(mq.x + mq.z + floor(mq.y) * 0.5);
          aLink = step(0.25, ring) * step(ring, 0.8) * step(0.2, fract(mq.y));
        }`)
      .replace('#include <lights_phong_fragment>', `BlinnPhongMaterial material;
        material.diffuseColor = diffuseColor.rgb;
        material.specularColor = R_SPEC[role];
        material.specularShininess = R_SHINE[role];
        material.specularStrength = 1.0;`)
      .replace('#include <opaque_fragment>', `
        vec3 aV = normalize(vViewPosition); // (to the camera)
        vec3 aPos = -vViewPosition;
        vec3 aF = (viewMatrix * vec4(uFireWorld, 1.0)).xyz;
        vec3 aToF = aF - aPos;
        float aDist = max(length(aToF), 0.05);
        aToF /= aDist;
        float aS = clamp(uFire, 0.0, 1.6);    // the fire now (its reflection swells and jitters with it)
        // ...and the light he's lit by (smoothed, floored; capped a little over the resting
        // glow, so a roaring fire shows in his reflections, not by bleaching his plate).
        float aL = clamp(uFireLit, 0.0, 1.15);
        // The fire is a point light: Lambert, falling off with distance (about as far as a
        // seat is from it: 1).
        float aAtt = clamp(pow(1.6 / aDist, 1.2), 0.3, 1.2);
        float aSide = dot(normal, aToF);
        float aDirect = max(aSide, 0.0) * aAtt * aL;
        vec3 aUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float aMoon = dot(normal, normalize((viewMatrix * vec4(uMoonDir, 0.0)).xyz));
        // The flame's reflection: the mirror ray against the flame, a column over the fire
        // (under its light, swelling and jittering with the flicker). Seen from his center,
        // not the texel, so a facet flashes whole: the flash depends on its turn alone.
        float aFlash = -9.0;
        float aHot = 0.0;
        // (Round 8's styles mirror as they did: their edges a little more, whatever the finish.)
        float aPolish = look >= 4 ? R_POLISH[role] * (role == 1 ? 1.25 / 1.15 : 1.0) * uReflect : R_POLISH[role] * uReflect * uPolish;
        vec3 aC = (viewMatrix * vec4(uCenter, 1.0)).xyz;
        // (The pixel styles shade the smooth plate, a sweep glides over it, and the flame
        // flashes in a plate as a whole: its mean normal.)
        bool cel = look >= 1 && look <= 3;
        vec3 aN = cel ? normalize(vSmoothN) : normal;
        vec3 aR = reflect(normalize(aC), aN);
        vec3 aRf = cel ? reflect(normalize(aC), normalize(vPatchN)) : aR;
        if (aPolish > 0.0 && aS > 0.05) {
          // (the flames lean and sway, stepped at the fire's 12 fps, and jitter with each flicker)
          float st = floor(uTime * 12.0) / 12.0;
          vec3 jw = vec3(0.13 * sin(st * 1.9) + 0.06 * sin(st * 4.3 + 1.0), 0.0, 0.1 * cos(st * 1.3))
            + vec3(sin(uFire * 71.3), 0.0, cos(uFire * 53.9)) * 0.05;
          vec3 fA = (viewMatrix * vec4(uFireWorld + vec3(0.0, -0.78, -0.26) + jw, 1.0)).xyz;
          vec3 fB = (viewMatrix * vec4(uFireWorld + vec3(0.0, -0.2 + 0.3 * (aS - 1.0), -0.26) + jw, 1.0)).xyz;
          vec3 sd = fB - fA; vec3 w0 = aC - fA;
          float b = dot(aRf, sd), c = dot(sd, sd), d = dot(aRf, w0), e = dot(sd, w0);
          float den = max(c - b * b, 1e-6);
          float tc = clamp((e - b * d) / den, 0.0, 1.0);
          vec3 q = fA + sd * tc - aC;
          float along = dot(q, aRf);
          float perp = length(q - aRf * along);
          float rad = mix(0.2, 0.09, tc) * sqrt(aS) * aPolish * (1.0 + 1.5 * uGlint);
          if (along > 0.0) aFlash = 1.0 - perp / rad;
          aHot = 1.0 - tc;
        }
        // The sweep: the facets whose mirror lies in the band (by its angle from the axis).
        float aSweep = 0.0;
        float aLead = 0.0;
        if (aPolish > 0.0 && uSweep.z > 0.01) {
          vec3 ax = uSweepAxis.w > 1.5 ? uSweepAxis.xyz
            : uSweepAxis.w > 0.5 ? normalize(aF - aC) : normalize((viewMatrix * vec4(uSweepAxis.xyz, 0.0)).xyz);
          float x = (uSweep.x - acos(clamp(dot(aR, ax), -1.0, 1.0))) / uSweep.y; // (0 at the front, 1 at the tail)
          if (x > -0.3 && x < 1.0) { aSweep = uSweep.z * min(1.0, aPolish); aLead = x < 0.3 ? 1.0 : 0.0; }
        }
        // What the facet mirrors (from his chest, so it takes it whole): the ground, warm
        // near the fire, or the cold sky.
        vec3 aRw = (vec4(aR, 0.0) * viewMatrix).xyz;
        float aGround = 0.0;
        if (aRw.y < -0.02) {
          vec2 hit = uCenter.xz + aRw.xz * (max(uCenter.y, 0.1) / -aRw.y);
          aGround = pow(clamp(1.0 - length(hit - uFireWorld.xz) / 2.3, 0.0, 1.0), 1.5) * smoothstep(-0.02, -0.3, aRw.y);
        }
        // The broad sheen: the facet halfway between the fire and the camera (Blinn-Phong).
        float aSheen = pow(max(dot(normal, normalize(aToF + aV)), 0.0), 24.0);
        // Other lights' glints (fireflies, rings, lamps): their Phong highlight, measured.
        float aGlints = dot(reflectedLight.directSpecular, vec3(0.3, 0.5, 0.2)) * uExposure;
        if (aGlints > 0.9 && R_POLISH[role] > 0.0) aFlash = max(aFlash, (aGlints - 0.9) * 0.6);
        float aGraze = 1.0 - abs(dot(aN, aV));
        outgoingLight = vec3(0.0);
        #include <opaque_fragment>`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        {
          float fogK = 0.0;
          #ifdef USE_FOG
            fogK = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          float ex = max(uExposure, 0.05);
          // Frost (the ice element): a glaze creeping up from the feet (down with uFlip), a
          // bright ragged front; glazed steel is paler, still shaded by his light, its edges
          // catching the ice's color.
          float h = clamp((vRest.y - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0);
          if (uFlip > 0.5) h = 1.0 - h;
          float fr = -1.0;
          if (uFrost > 0.001) fr = uFrost * 1.15 - h + (wBayer4(gl_FragCoord.xy) - 0.5) * 0.1 + (wNoise(vRest * 14.0) - 0.5) * 0.14;
          vec3 col = uVoid;
          bool steel = role <= 1 || role == 3;
          // The mark (the color buffer's alpha; the scenery's is 1; pixelPass.js ARMOR_MARK):
          // 0.2 anything of his the pass keeps as it is (set by each style below).
          float aMark = 0.2;
          if (look == 0) {
            // ---- Gunmetal: natural light up the steel ramp (the header).
            float pol = min(aPolish, 1.6);
            // The light, in tones up the steel ramp (-1 the void, 0..4): the fire on this facet,
            // the cold sky and moon on the rest, the sheen and the ground it mirrors.
            float fill = 0.22 * (0.5 + 0.5 * dot(normal, aUp)) + 0.3 * max(aMoon, 0.0);
            // (The fire's light off the ground round it, on the facets turned down and aside.)
            float bounce = (0.5 - 0.5 * dot(normal, aUp)) * aAtt * aL;
            // (The fire's light eases off at the top: a plate facing it is the ramp's upper middle,
            // the sheen takes it to the top.)
            float t = -0.3 + 4.2 * (1.0 - exp(-1.3 * aDirect)) + 1.5 * fill + 0.8 * bounce + uBias + pol * aL * (1.4 * aSheen * aAtt + 1.0 * aGround);
            // Wear, at the scale of the plates: each a touch lighter or darker than the next, the
            // raised rims and ridges worn bright, the undersides where plates overlap darker.
            t += (vPiece - 0.5) * 0.8;
            if (role == 1) t += 0.6;
            t -= 0.9 * smoothstep(-0.25, -0.75, vRestN.y);
            if (role == 3) t -= 0.6 + (1.0 - aLink); // (mail: duller, the gaps a step darker)
            t -= 0.8 * fogK;                         // (fog: smoothly down the ramp)
            if (fr > 0.0) t += 1.6;
            t += 2.0 * uLift;                        // (a flash in his own steel: up the ramp)
            float aTone = -9.0; // steel's tone on the ramp (-1 void .. 4), -9 anything else: the mark below
            if (steel) {
              float tq = clamp(t, -1.0, 4.0);
              float k = floor(tq);
              float f = tq - k;
              col = mix(aSteel(int(k)), aSteel(int(k) + 1), smoothstep(1.0 - BLEND, 1.0, f));
              aTone = min(4.0, f > 1.0 - BLEND * 0.5 ? k + 1.0 : k);
              // Mirroring the warm ground by the fire: its dark, in the flame's shade.
              if (role <= 1 && aGround * aL * pol > 0.62 && t < 2.5) { col = uShade; aTone = -9.0; }
            } else if (role == 4) {
              col = t > 2.4 ? uWood : t > 0.6 ? uShadow : uVoid;
            } else if (role == 5) {
              col = t > 2.4 ? uShadow : uVoid;
            }
            // The flame in the mirror: hi, its heart core.
            float kf = aFlash * (1.0 - 0.5 * fogK);
            if (role <= 1) {
              if (kf > 0.62 && aHot > 0.4) { col = uCore; aTone = -9.0; }
              else if (kf > 0.2) { col = uHi; aTone = -9.0; }
            }
            // The sweep over it: hi, the leading edge of a flare's in core.
            float sw = aSweep * (1.0 - 0.5 * fogK);
            if (sw > 0.2 && role <= 1) { col = aLead > 0.5 && uSweep.w > 0.5 && sw > 0.45 ? uCore : uHi; aTone = -9.0; }
            // The mark: steel with its tone on the ramp, 0.30 (void) + 0.025 a tone, and 0.15
            // more on the fire's side, so the pass snaps it to the steel ramp, steps its
            // creases down it and rims his silhouette in the fire's color on that side.
            aMark = aTone > -5.0 ? 0.325 + 0.025 * aTone + (aSide > 0.2 ? 0.15 : 0.0) : 0.2;
          } else if (look <= 3) {
            // ---- The pixel styles: the smooth plate in flat bands by the fire's key light.
            vec3 kL = (viewMatrix * vec4(uFireWorld + vec3(0.0, uKeyLift, 0.0), 1.0)).xyz - aPos;
            float kD = max(length(kL), 0.05);
            kL /= kD;
            // (The key falls off with distance, steeply: ~0.9 as far as a seat is from it, no
            // more than 1.05 close to it; times the light he's lit by, floored and smoothed. It
            // doesn't reach into the gaps.)
            float kAtt = clamp(pow(1.7 / kD, 1.5), 0.3, 1.05) * aL;
            float nl = dot(aN, kL);
            float occ = smoothstep(0.2, 0.6, vOcc);
            float key = max(nl, 0.0) * kAtt * (1.0 - occ);
            // A rounded plate (a pauldron's dome, a helmet's crown, a lame, a sabaton: any plate
            // that isn't a ring round a limb, big enough on screen for bands) is curved metal:
            // the light across it is steeper than on a flat plane (a lit crescent where it turns
            // squarely to the fire, the flame's tips at its heart, then steel, mids and a dark
            // far side, not one flat disc of the flame's color), and where it mirrors the dark
            // sky (its upper curve, seen from above) it's a band darker still.
            float curved = smoothstep(0.2, 0.35, vPatch.w) * smoothstep(5.0, 8.0, vPatch.z * vPx);
            if (curved > 0.0) {
              float sky = smoothstep(0.1, 0.6, (vec4(reflect(-aV, aN), 0.0) * viewMatrix).y);
              float pivot = ROUND_PIVOT * kAtt;
              key = mix(key, pivot + ROUND_GAIN * (key - pivot) - ROUND_SKY * sky, curved);
            }
            // (The dim cool fill on the far side: the moon, the sky.)
            float fillL = (0.55 * max(dot(aN, normalize((viewMatrix * vec4(uMoonDir, 0.0)).xyz)), 0.0) + 0.3 * max(dot(aN, aUp), 0.0)) * (1.0 - occ);
            bool hard = look == 3;
            // The dither on the band edges: near an edge, each texel's ordered threshold (the
            // pass's own Bayer matrix and size, so it lines up texel for texel with the scene's
            // dither) steps it across (celDither): the wider band's texels into the narrower,
            // fewer the further from the edge, so a thin band (the light steel on the turn)
            // grows teeth from both sides rather than breaking up. The lit bands always step
            // down into the steel, never out over it, so the dither makes no lone lit texel for
            // the pass's terminator to ring. Its amount is the style's at the site's Dither
            // (0.08), twice it from 0.16 on (Bonfire Live's slider goes to 0.4: capped, so it
            // can't turn to speckle), none at 0 (the flat bands exactly). The far side's edges
            // (the fill, the turn past the light) and a rounded plate's dark bands dither the
            // same way; the highlight, the lips, the flame's flash and the sweeps, a flash of
            // his own (uLift), the frost and the dissolve don't.
            float dA = uCelDither * clamp(uDither / 0.08, 0.0, 2.0);
            float kv = key;
            float fv = fillL;
            float nv = nl;
            if (dA > 0.0) {
              float thr = (uDitherScale > 6.0 ? wBayer8(gl_FragCoord.xy) : wBayer4(gl_FragCoord.xy)) - 0.5;
              float reach = celReach(vPx);
              float kw = length(vec2(dFdx(key), dFdy(key)));
              float fw = length(vec2(dFdx(fillL), dFdy(fillL)));
              float nw = length(vec2(dFdx(nl), dFdy(nl)));
              // (The key's edge nearest it and the bands either side, in its units: 0.32, 0.55
              // and 0.72 (the body: about 0.3 up to its peak); chiaroscuro's 0.38 and 0.76; a
              // rounded plate's -0.1, 0.12, 0.55 and 0.72, chiaroscuro's 0.05, 0.38 and 0.76.)
              float e = 0.72, wd = 0.17, wu = 0.3;
              if (curved > 0.5) {
                if (hard) { if (key < 0.215) { e = 0.05; wd = 0.3; wu = 0.33; } else if (key < 0.57) { e = 0.38; wd = 0.33; wu = 0.38; } else { e = 0.76; wd = 0.38; wu = 0.3; } }
                else if (key < 0.01) { e = -0.1; wd = 0.3; wu = 0.22; }
                else if (key < 0.335) { e = 0.12; wd = 0.22; wu = 0.43; }
                else if (key < 0.635) { e = 0.55; wd = 0.43; wu = 0.17; }
              } else if (hard) { if (key < 0.57) { e = 0.38; wd = 0.38; wu = 0.38; } else { e = 0.76; wd = 0.38; wu = 0.29; } }
              else if (key < 0.435) { e = 0.32; wd = 0.32; wu = 0.23; }
              else if (key < 0.635) { e = 0.55; wd = 0.23; wu = 0.17; }
              kv += celDither(key, kw, e, wd, wu, e < 0.7 && wd > wu, thr, dA, reach);
              // (The fill's at 0.1 and 0.42, chiaroscuro's at 0.45; the turn's at -0.3.)
              if (hard) fv += celDither(fillL, fw, 0.45, 0.45, 0.4, true, thr, dA, reach);
              else if (fillL < 0.26) fv += celDither(fillL, fw, 0.1, 0.1, 0.32, false, thr, dA, reach);
              else fv += celDither(fillL, fw, 0.42, 0.32, 0.43, false, thr, dA, reach);
              nv += celDither(nl, nw, -0.3, 0.7, 0.3, true, thr, dA, reach);
            }
            // The bands (steel.js CEL_TONES): the fire's body only where a plate squarely faces
            // the fire, a light steel on the turn, mid steel as it turns away; the far side
            // and the gaps dark (the moon's and the sky's fill: shadow; else near-black).
            // Chiaroscuro: the body, mid steel, the dark.
            float b;
            if (hard) b = kv > 0.76 ? 4.0 : kv > 0.38 ? 2.0 : fv > 0.45 ? 1.0 : 0.0;
            else b = kv > 0.72 ? 4.0 : kv > 0.55 ? 3.0 : kv > 0.32 ? 2.0 : fv > 0.42 ? 2.0 : (fv > 0.1 || nv > -0.3) ? 1.0 : 0.0;
            // (A rounded plate's far side steps down its own dark bands, not by the fill.)
            if (curved > 0.5 && kv <= 0.32) b = hard ? (kv > 0.05 ? 1.0 : 0.0) : kv > 0.12 ? 2.0 : kv > -0.1 ? 1.0 : 0.0;
            if (vOcc > 0.7) b = 0.0; else if (vOcc > 0.55) b = min(b, 1.0);
            // Metal: steel off the lit bands that mirrors the dark sky (a rounded plate's upper
            // curve) a band down, the dark band of polished plate between its light and its rim.
            if (role <= 1 && b >= 2.0 && b <= 3.0 && aRw.y > 0.45) b -= 1.0;
            // The highlight: a crescent where a rounded plate faces the fire and turns from the
            // camera (on its fire-side curve), a small glint where it mirrors the fire, and on
            // a rounded plate the heart of its lit crescent.
            float spec = pow(max(dot(aN, normalize(kL + aV)), 0.0), 70.0) * kAtt * (1.0 - occ);
            if (role != 3 && ((key > (hard ? 0.6 : 0.55) && dot(aN, aV) < 0.5) || spec > 0.9 || (curved > 0.5 && key > ROUND_HOT))) b = 5.0;
            // Bright lips: the raised edges the fire lights catch it a band up (painterly's a
            // little further round, never on the far side).
            if (role == 1 && key > (look == 2 ? 0.55 : 0.68)) b = min(5.0, b + 1.0);
            if (role == 3) b = max(0.0, min(b, 3.0) - 1.0); // (mail: duller)
            if (fr > 0.0) b = min(5.0, b + 2.0);           // (glazed: paler)
            // A flash in his own tones (he formed, a new helmet): his bands a step or two up,
            // into the flame's only on the side facing it.
            if (uLift > 0.05) b = max(b, min(nl > 0.2 ? 5.0 : 3.0, b + floor(uLift * 2.4 + 0.2)));
            // The flame in the mirror: a plate facing the fire flashes as a whole, into the
            // flame's body or a band up (its heart: the highlight), and the sweep glides over
            // the plates facing it the same way (a flare's leading edge in the highlight): the
            // far side never lights. (A rounded plate flashes a band or two up, keeping its
            // curve: a disc of the flame's color would flatten it.)
            float kf = aFlash * (1.0 - 0.5 * fogK);
            float sw = aSweep * (1.0 - 0.5 * fogK);
            if (role <= 1 && nl > 0.2) {
              bool rd = curved > 0.5;
              if (kf > 0.62 && aHot > 0.4) b = rd ? min(5.0, b + 2.0) : 5.0;
              else if (kf > 0.2) b = rd ? min(5.0, b + 1.0) : max(4.0, min(5.0, b + 1.0));
              if (sw > 0.2) b = aLead > 0.5 && uSweep.w > 0.5 && sw > 0.45 ? (rd ? min(5.0, b + 2.0) : 5.0) : rd ? min(5.0, b + 1.0) : max(4.0, min(5.0, b + 1.0));
            }
            // (Fog: a far knight's bands step down, toward the steel, never onto a flame tone.)
            if (fogK > 0.85) b = b >= 4.0 ? (hard ? 2.0 : 3.0) : max(0.0, b - 1.0);
            if (steel) col = aCel(int(b));
            else if (role == 4) col = b > 2.5 ? uWood : b > 0.5 ? uShadow : uVoid;
            else if (role == 5) col = b > 2.5 ? uShadow : uVoid;
            // The mark: 0.62 + 0.002 the smooth surface's id (0..63), 0.14 more on the fire's
            // side, so the pass draws a line where two surfaces meet, snaps him to the tones
            // without a dither of its own (his is drawn above, on the band edges) and rims his
            // silhouette on that side. A slight surface drawn
            // under 6 texels across marks the id of the one it merges into (no line between
            // them: a finger's faces, a fauld's hoops, a visor's breaths).
            float pid = vPatch.z * vPx < 6.0 ? vPatch.y : vPatch.x;
            aMark = 0.62 + 0.002 * floor(pid + 0.5) + (dot(aN, aToF) > 0.15 ? 0.14 : 0.0);
          } else {
            // ---- Round 8's blackened plate (4 black and gold, 5 the first build): each facet
            // a tone of the scene's own darks by its turn to the fire (its strength now, not
            // the scene's light levels: the same at every seat); facets toward the moon, the
            // sky or the camera never drop to the void (a backlit dancer still shows his
            // front); rims edge-on on a lit side a step up; fog a step down.
            float aLit = dot(normal, aToF) * min(aS, 1.25);
            float drop = fogK > 0.55 ? 1.0 : 0.0;
            float aFill = max(dot(normal, aV), dot(normal, aUp) - 0.1);
            float tone = aLit > 0.38 ? 2.0 : (aLit > 0.1 || aMoon > 0.62 || aFill > 0.62) ? 1.0 : 0.0;
            if (aGraze > 0.82 && (aLit > -0.15 || aMoon > 0.25) && tone < 2.0) tone += 1.0;
            tone = max(0.0, tone - drop);
            if (fr > 0.0) tone = min(2.0, tone + 1.0);
            if (uLift > 0.35) tone = min(2.0, tone + 1.0); // (a flash in his own tones)
            float aTone = -1.0;
            if (steel) {
              if (role == 3) tone = max(0.0, tone - (1.0 - aLink)); // (mail: the gaps a step darker)
              col = tone > 1.5 ? uStone : tone > 0.5 ? uShadow : uVoid;
              aTone = tone;
            } else if (role == 2) {
              // Gilt: shadow where the fire doesn't reach it, wood (a dark gold) where it
              // does; the first build's trim is never darker than the flame's lo (it glows).
              if (look == 5) col = aLit - 0.12 * drop > 0.2 ? uMid : uLo;
              else col = aLit - 0.12 * drop > 0.2 ? uWood : uShadow;
            } else if (role == 4) {
              col = tone > 1.5 ? uWood : tone > 0.5 ? uShadow : uVoid;
            } else if (role == 5) {
              col = tone > 1.5 ? uShadow : uVoid;
            }
            // The flame in the mirror: hi, its heart core (gilt: the flame's mid at the fringe
            // of its reflection, core only on a glint).
            float kf = aFlash * (1.0 - 0.6 * fogK);
            if (role == 2) {
              if (kf > 0.72 && (aHot > 0.5 || uGlint > 0.15)) col = uCore;
              else if (kf > 0.3) col = uHi;
              else if (kf > -0.6) col = uMid;
            } else if (role <= 1) {
              if (kf > 0.62 && aHot > 0.4) { col = uCore; aTone = -1.0; }
              else if (kf > 0.2) { col = uHi; aTone = -1.0; }
            }
            float sw = aSweep * (1.0 - 0.6 * fogK);
            if (sw > 0.2 && role <= 2) { col = aLead > 0.5 && uSweep.w > 0.5 && sw > 0.45 ? uCore : uHi; aTone = -1.0; }
            // The mark: steel left in a flat tone (void, shadow, stone) in the steel marks, so
            // the pass draws its creases a step darker in its own hue (no steel ramp here).
            aMark = aTone >= 0.0 ? 0.325 + 0.025 * aTone : 0.2;
          }
          gl_FragColor.rgb = col / ex;
          if (uHover > 0.001) {
            // (On the pixel styles' smooth plates only the grazing edge: a rim, not a wash.)
            float hr = look >= 1 && look <= 3 ? pow(aGraze, 4.0) * 1.3 : pow(aGraze, 1.5);
            if (hr * uHover > 0.28 && role != 6) { gl_FragColor.rgb = (hr * uHover > 0.55 ? uHi : uMid) / ex; aMark = 0.2; }
          }
          if (uGlow > 0.001) { gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge / ex, uGlow * 0.6); if (uGlow > 0.05) aMark = 0.2; }
          if (fr > 0.0 && (fr < 0.06 || (steel && aGraze > 0.72) || role == 4)) { gl_FragColor.rgb = uFrostColor / ex; aMark = 0.2; }
          if (uDissolve > 0.001) {
            float dv = wNoise(vRest * 9.0) * 0.45 + wBayer4(gl_FragCoord.xy) * 0.25 + h * 0.3;
            float e = dv - (uDissolve * 1.15 - 0.05);
            if (e < 0.0) discard;
            if (e < 0.05) { gl_FragColor.rgb = uEdgeHot / ex; aMark = 0.2; }
            else if (e < 0.12) { gl_FragColor.rgb = uEdge / ex; aMark = 0.2; }
            else if (e > 0.19 && e < 0.215) { gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge / ex, 0.6); aMark = 0.2; }
          }
          gl_FragColor.a = aMark;
        }`);
  };
  return mat;
}
