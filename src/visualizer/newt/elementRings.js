// The page's element effects use page-space origins and a flat ground.
import * as THREE from 'three';
import { createImpactFx, createSmokeMaterial } from '../../bonfire/impact.js';
import { createLightningRing } from '../../bonfire/lightningRing.js';
import { createIceRing, createCrystals } from '../../bonfire/ice.js';
import { createGroundMarks } from '../../bonfire/marks.js';
import { createDebris } from '../../bonfire/debris.js';
import { createChill } from '../../bonfire/chill.js';
import { createCurlField } from '../../bonfire/curl.js';
import { createParticleMaterial, createEffectMaterial, SHAPE } from '../../bonfire/flame.js';
import { effects } from '../../effects.js';
import { flames } from '../../palette.js';
import { pageOf } from './pages.js';

export const pageLights = (page, lights) => (pageOf(page).light ? [] : lights);

export function createElementRings({
  scene,
  frame,
  scope,
  page = () => 'dusk',
  letter = () => null,
  reducedMotion = false,
  pageHalf = 7,
}) {
  const origin = new THREE.Vector3(0, 0, 0);
  const field = createCurlField();
  const particle = scope.own(createParticleMaterial(frame.depthTexture, frame.pass.uniforms.resolution.value));
  const fxMaterial = scope.own(createEffectMaterial(particle));
  const sparkMaterial = scope.own(createEffectMaterial(particle, { shape: SHAPE.cross }));
  const glintMaterial = scope.own(createEffectMaterial(particle, { shape: SHAPE.diamond }));
  const smokeMaterial = scope.own(createSmokeMaterial());
  const reach = () => pageHalf;
  // Light pages use no point lights; the void supplies the paper's exact color.
  const lights = pageOf(page()).light ? 0 : 6;
  const chill = createChill({ material: smokeMaterial, field, origin: origin.clone(), reducedMotion });
  chill.setGround(() => 0);
  const fire = /** @type {(options: any) => any} */ (createImpactFx)({
    fireMaterial: fxMaterial,
    smokeMaterial,
    origin: origin.clone(),
    field,
    reach,
    lights,
    reducedMotion,
  });
  const lightning = /** @type {(options: any) => any} */ (createLightningRing)({
    fxMaterial,
    sparkMaterial,
    origin: origin.clone(),
    field,
    reach,
    source: letter,
    lights,
    reducedMotion,
  });
  const ice = /** @type {(options: any) => any} */ (createIceRing)({
    fxMaterial,
    glintMaterial,
    origin: origin.clone(),
    field,
    reach,
    chill,
    lights,
    reducedMotion,
  });
  const crystals = /** @type {(options: any) => any} */ (createCrystals)({
    fxMaterial,
    glintMaterial,
    origin: origin.clone(),
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
  const pageLightObjects = pageLights(page(), [...fire.lights, ...lightning.lights, ...ice.lights]);
  for (const l of pageLightObjects) scene.add(l);
  // Marks have their own transparent, unlit surface. Unmarked texels draw nothing.
  const markMaterial = new THREE.ShaderMaterial({
    uniforms: marks.uniforms,
    vertexShader: `uniform vec4 uMarkBox; varying vec2 vMarkUv; void main() { vec4 world = modelMatrix * vec4(position,1.); vMarkUv = (world.xz-uMarkBox.xy)/uMarkBox.zw; gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform sampler2D tMarks; uniform sampler2D tMarkGlow; varying vec2 vMarkUv; void main() { vec4 mark=texture2D(tMarks,vMarkUv); if(mark.a<=0.) discard; gl_FragColor=vec4(mark.rgb+texture2D(tMarkGlow,vMarkUv).rgb*.7,mark.a); }`,
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
    crystalLife = 0;
  function setElement(element, flame = 'ember') {
    kind = pageOf(page()).light ? 'ice' : element;
    ramp = (flames[flame] ?? flames.ember).ramp;
    for (const r of [fire, lightning, ice, crystals, chill]) r.setRamp(ramp);
    crystals.setActive(false);
  }
  // scar/ring retain sceneFire's sizes, strengths and debris power.
  function scar(size = 1, ring = false) {
    const colors = ramp.map((c) => new THREE.Color(c));
    marks.stamp(kind, origin.x, origin.z, ring ? 1.5 : 0.22 + 0.18 * size, colors, {
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
    if (pageOf(page()).light) kind = 'ice';
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
      for (const light of pageLightObjects) light.visible = !pageOf(page()).light;
      crystalLife = Math.max(0, crystalLife - dt);
      crystals.setActive(crystalLife > 0);
      fire.step(dt, t);
      lightning.step(dt, t);
      ice.step(dt);
      crystals.step(dt, t, 1);
      chill.step(dt, t);
      marks.step(dt);
      for (const d of Object.values(debris)) d.step(dt);
    },
  };
}
