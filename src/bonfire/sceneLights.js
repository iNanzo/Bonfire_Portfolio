// The bonfire's lights (scene.js makes them right after the scene): a dim sky and moon, the
// fire's own point light (the one that casts a shadow, a cube map), the ruins' candle, and a
// fixed pool of lamps for the other places' (scenery.js). Each frame the scene's update
// flickers them with the flame and the element, and moves the fire's light to the lightning
// ball.
import * as THREE from 'three';
import { MAX_LAMPS } from './scenery.js';

/**
 * The lights, put in `scene`. The fire's light casts a shadow where `renderer` draws them.
 * @param {any} scene  @param {any} renderer
 */
export function createSceneLights(scene, renderer) {
  scene.add(new THREE.HemisphereLight(0x3a3f58, 0x07070b, 0.18));
  const moon = new THREE.DirectionalLight(0x6f7fb0, 0.22);
  moon.position.set(-3, 5, -4);
  scene.add(moon);

  const fireLight = new THREE.PointLight(0xff8a3c, 9, 0, 1.6);
  const FIRE_LIGHT_AT = new THREE.Vector3(0, 0.95, 0.28); // slightly in front, so the weapon's face catches light
  const ballLightAt = new THREE.Vector3();
  const BALL_LIGHT_MIN_Y = 0.62; // just above the logs' teepee
  fireLight.position.copy(FIRE_LIGHT_AT);
  fireLight.castShadow = renderer.shadowMap.enabled;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.bias = -0.004;
  fireLight.shadow.normalBias = 0.02; // (no acne on thin, faceted pieces: posts, cylinders)
  fireLight.shadow.camera.near = 0.05;
  fireLight.shadow.camera.far = 10;
  scene.add(fireLight);

  const candleLight = new THREE.PointLight(0xffb25a, 0.35, 2.5, 1.8);
  scene.add(candleLight);
  // The other sceneries' lamps (scenery.js) take their places in a fixed pool, and the
  // candle's light goes dark away from the ruins: every light stays in the scene (and on
  // every layer, once the model is in), so the lit shaders are built once, at load, and a
  // new place or a pass that sees different lights never makes them rebuild.
  const lamps = Array.from({ length: MAX_LAMPS }, () => {
    const l = new THREE.PointLight(0xffb25a, 0, 2, 1.8);
    l.userData.base = 0;
    scene.add(l);
    return l;
  });
  return { moon, fireLight, FIRE_LIGHT_AT, ballLightAt, BALL_LIGHT_MIN_Y, candleLight, lamps };
}
