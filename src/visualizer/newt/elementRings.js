// The page's element effects use page-space origins and a flat ground.
import * as THREE from 'three';
import { createImpactFx, createSmokeMaterial } from '../../bonfire/impact.js';
import { createLightningRing } from '../../bonfire/lightningRing.js';
import { createIceRing, createCrystals } from '../../bonfire/ice.js';
import { createGroundMarks } from '../../bonfire/marks.js';
import { createDebris } from '../../bonfire/debris.js';
import { createChill } from '../../bonfire/chill.js';
import { createCurlField } from '../../bonfire/curl.js';
import { createParticleMaterial, createEffectMaterial, SHAPE, DITHER_GLSL } from '../../bonfire/flame.js';
import { effects } from '../../effects.js';
import { flames } from '../../palette.js';
import { pageOf } from './pages.js';

export const pageLights = (page, lights) => (pageOf(page).light ? [] : lights);

// Copied from src/bonfire/sceneFire.js:49-61,183-207: scar/ring facade, adapted to paper.
export function createElementRings({
  scene,
  frame,
  scope,
  page = () => 'dusk',
  letter = () => null,
  reducedMotion = false,
  pageHalf = 7,
  coarse = false,
}) {
  const origin = new THREE.Vector3(0, 0, 0);
  const field = createCurlField();
  const particle = scope.own(createParticleMaterial(frame.depthTexture, frame.pass.uniforms.resolution.value));
  const fxMaterial = scope.own(createEffectMaterial(particle));
  const sparkMaterial = scope.own(createEffectMaterial(particle, { shape: SHAPE.cross }));
  const glintMaterial = scope.own(createEffectMaterial(particle, { shape: SHAPE.diamond }));
  const smokeMaterial = scope.own(createSmokeMaterial());
  const reach = () => pageHalf;
  const iceReach = () => 1.1;
  const impactCount = (n) =>
    Math.max(1, Math.round(n * effects.particles.impact * (coarse ? effects.particles.touchScale : 1)));
  // Allocate both page tiers once; their intensities follow the current page after each step.
  const lights = coarse ? 4 : 6;
  const chill = createChill({ material: smokeMaterial, field, origin, count: impactCount(1400), reducedMotion });
  chill.setGround(() => 0);
  const fire = /** @type {(options: any) => any} */ (createImpactFx)({
    emitters: coarse ? 90 : 144,
    flames: impactCount(3200),
    haze: impactCount(1500),
    smoke: impactCount(520),
    ash: impactCount(220),
    embers: impactCount(160),
    fireMaterial: fxMaterial,
    smokeMaterial,
    origin,
    field,
    reach,
    lights,
    reducedMotion,
  });
  const lightning = /** @type {(options: any) => any} */ (createLightningRing)({
    fxMaterial,
    sparkMaterial,
    origin,
    field,
    reach,
    source: letter,
    emitters: coarse ? 72 : 96,
    sparks: impactCount(260),
    lights,
    reducedMotion,
  });
  const ice = /** @type {(options: any) => any} */ (createIceRing)({
    fxMaterial,
    glintMaterial,
    origin,
    field,
    reach: iceReach,
    chips: impactCount(320),
    chill,
    lights,
    reducedMotion,
  });
  const crystals = /** @type {(options: any) => any} */ (createCrystals)({
    fxMaterial,
    glintMaterial,
    origin,
    field,
    chill,
    reducedMotion,
  });
  const marks = /** @type {(options: any) => any} */ (createGroundMarks)({ center: origin.clone(), half: pageHalf });
  scope.cleanup(() => marks.dispose());
  const debris = Object.fromEntries(
    ['fire', 'ice', 'lightning'].map((kind) => [
      kind,
      /** @type {(options: any) => any} */ (createDebris)({
        kind,
        count: impactCount(120),
        material: kind === 'ice' ? glintMaterial : kind === 'lightning' ? sparkMaterial : fxMaterial,
        reducedMotion,
      }),
    ]),
  );
  for (const d of Object.values(debris)) d.setGround(() => 0);
  const add = (o, layer) => {
    scope.trackTree(o);
    o.layers.set(layer);
    scene.add(o);
  };
  for (const o of [
    fire.ring,
    fire.embers,
    fire.wave,
    ...lightning.objects,
    ...ice.objects,
    ...crystals.objects,
    ...Object.values(debris).map((d) => d.points),
  ])
    add(o, 1);
  for (const o of [fire.haze, fire.puff, fire.flecks, chill.points]) add(o, 2);
  crystals.solid.layers.set(0);
  ice.solid.layers.set(0);
  const pageLightObjects = [...fire.lights, ...lightning.lights, ...ice.lights];
  // Their source geometry is bonfire-sized. Compress only height on the outer ring,
  // and the central cluster around its moving origin; the figure remains clear above his knees.
  ice.solid.scale.y = 0.3;
  const iceWidth = coarse ? 0.5 : 1;
  // Frost spokes extend to 1.8 times their stamp radius; keep the entire mark
  // within the shard field, including the narrow phone shot.
  const ringRadius = () => (kind === 'ice' ? (iceReach() * iceWidth) / 1.8 : 1.5);
  const iceSpreadObjects = [...ice.objects, chill.points];
  for (const object of iceSpreadObjects) {
    object.scale.x = iceWidth;
    object.scale.z = iceWidth;
  }
  const smallCrystals = crystals.objects.filter((o) => o === crystals.solid || o.isPoints);
  for (const object of smallCrystals) object.scale.setScalar(0.22);
  for (const l of pageLightObjects) scene.add(l);
  // Marks have their own transparent, unlit surface. Unmarked texels draw nothing.
  const markMaterial = new THREE.ShaderMaterial({
    uniforms: marks.uniforms,
    vertexShader: `uniform vec4 uMarkBox; varying vec2 vMarkUv; void main() { vec4 world = modelMatrix * vec4(position,1.); vMarkUv = (world.xz-uMarkBox.xy)/uMarkBox.zw; gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `${DITHER_GLSL}
      uniform sampler2D tMarks; uniform sampler2D tMarkGlow; varying vec2 vMarkUv;
      void main() {
        vec4 mark=texture2D(tMarks,vMarkUv);
        vec3 glow=texture2D(tMarkGlow,vMarkUv).rgb;
        float coverage=max(mark.a,max(glow.r,max(glow.g,glow.b)));
        if(coverage<=0.) discard;
        // Fade coverage, not ink brightness: faint marks still quantize darker than paper.
        if(pBayer4(gl_FragCoord.xy)>=coverage) discard;
        gl_FragColor=vec4(mark.rgb+glow*.7,1.);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(pageHalf * 2, pageHalf * 2), markMaterial);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.005;
  add(surface, 2);
  let kind = 'fire',
    ramp = flames.ember.ramp,
    t = 0,
    crystalLife = 0,
    lastRing = null;
  function setElement(element, flame = 'ember') {
    kind = pageOf(page()).light ? 'ice' : element;
    const warm = (flames[flame] ?? flames.ember).ramp;
    ramp = kind === 'ice' ? ['#0f2f66', '#2f7fe0', '#8cc8ff', '#e8f4ff'] : warm;
    for (const r of [fire, lightning]) r.setRamp(warm);
    for (const r of [ice, crystals, chill]) r.setRamp(['#0f2f66', '#2f7fe0', '#8cc8ff', '#e8f4ff']);
    crystals.setActive(false);
  }
  // scar/ring retain sceneFire's sizes, strengths and debris power.
  function scar(size = 1, ring = false) {
    const colors = ramp.map((c) => new THREE.Color(c));
    if (ring) lastRing = { x: origin.x, z: origin.z, radius: ringRadius() };
    marks.stamp(kind, origin.x, origin.z, ring ? ringRadius() : 0.22 + 0.18 * size, colors, {
      strength: Math.min(1, 0.6 + 0.4 * size),
      ring,
    });
    const n = Math.round((kind === 'lightning' ? 16 : 10) * size * effects.impact.debris);
    if (n > 0 && !ring) {
      debris[kind].setRamp(colors);
      debris[kind].throw(origin.x, 0.08, origin.z, n, { power: 0.6 + 0.5 * size });
    }
  }
  function ring(strength = 1) {
    if (reducedMotion) return;
    if (pageOf(page()).light && kind !== 'ice') setElement('ice');
    const s = Math.min(1.5, Math.max(0, strength));
    scar(s, true);
    if (kind === 'lightning') lightning.burst(effects.lightning.height);
    else if (kind === 'ice') {
      crystalLife = 2;
      crystals.setActive(true);
      ice.burst();
      crystals.burst(0.8 * s);
      crystals.beat(1);
      crystals.echo();
    } else fire.burst();
  }
  return {
    fire,
    lightning,
    ice,
    crystals,
    marks,
    debris,
    chill,
    surface,
    setElement,
    get markRing() {
      return lastRing ?? { x: origin.x, z: origin.z, radius: ringRadius() };
    },
    get time() {
      return t;
    },
    setDepth(depth) {
      particle.uniforms.tDepth.value = depth;
    },
    setOrigin(x, z) {
      origin.set(x, 0, z);
      for (const object of iceSpreadObjects) object.position.set(x * (1 - iceWidth), 0, z * (1 - iceWidth));
      for (const object of smallCrystals) object.position.set(x * 0.78, 0, z * 0.78);
    },
    drop(element, flame, pending, strength = 1) {
      if (pending) return;
      setElement(element, flame);
      ring(strength);
    },
    ring,
    get element() {
      return kind;
    },
    impact(element, flame) {
      setElement(element, flame);
      scar(1.2);
      ring();
    },
    step(dt) {
      t += dt;
      crystalLife = Math.max(0, crystalLife - dt);
      crystals.setActive(crystalLife > 0);
      fire.step(dt, t);
      lightning.step(dt, t);
      ice.step(dt);
      crystals.step(dt, t, 1);
      chill.step(dt, t);
      marks.step(dt);
      for (const d of Object.values(debris)) d.step(dt);
      for (const light of ice.lights) {
        light.position.x = origin.x + (light.position.x - origin.x) * iceWidth;
        light.position.z = origin.z + (light.position.z - origin.z) * iceWidth;
      }
      if (pageOf(page()).light) for (const light of pageLightObjects) light.intensity = 0;
    },
  };
}
