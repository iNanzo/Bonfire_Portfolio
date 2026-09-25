// What happens when a new weapon lands:
//   • ring — a ring of fire bursts out across the ground. The ring is a circle of
//     moving emitters; each one races outward along its own heading (slowing as
//     it goes) and throws off flame tongues that rise and curl through the same
//     curl-noise field as the bonfire. When an emitter reaches something in the
//     way (pillar, wall, logs, rubble) it stops, flares and climbs it, then dies;
//     the rest burn lower and die out toward the edges of the clearing. A handful
//     of point lights ride the ring in the flame's color.
//   • haze — a ring of smoke that trails the flames: fine wisps shed behind the
//     fire front, lit from below by the flame as they rise, drift and thin.
//   • puff — a billow of fine smoke wisps from the impact that rolls up and out.
//   • ash — pale flakes thrown up that flutter back down, rocking side to side,
//     and settle on the ground.
//   • embers — glowing sparks in the new flame's color, thrown up, cooling as
//     they arc and fall.
// Flames and embers are additive (fx pass); smoke and ash are drawn with normal
// blending in the color pass so they darken what's behind them before the
// palette dither. Every particle is 1–3 texels: the effect reads as many fine
// specks, not big squares.
import * as THREE from 'three';

const smokeVertex = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  attribute float alpha;
  uniform float sizeScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Dead particles go outside the clip volume (a 0 point size still draws a pixel on some GPUs).
    gl_Position = size <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
    gl_PointSize = size <= 0.0 ? 1.0 : clamp(floor(size * sizeScale / -mv.z + 0.5), 1.0, 3.0);
  }
`;
const smokeFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(vColor, vAlpha); }
`;

/** Normal-blended square points for smoke and ash (color pass), 1–3 texels. */
export function createSmokeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { sizeScale: { value: 6 } },
    vertexShader: smokeVertex,
    fragmentShader: smokeFragment,
    transparent: true,
    depthWrite: false,
  });
}

function points(n, material, withAlpha) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (withAlpha) g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  return p;
}

const TAU = Math.PI * 2;

/**
 * @param {object} o
 * @param {THREE.Material} o.fireMaterial   additive particle material (fx pass)
 * @param {THREE.Material} o.smokeMaterial  normal-blended (color pass)
 * @param {THREE.Vector3} o.origin          fire center on the ground
 * @param {object} o.field                  shared curl-noise field (curl.js)
 * @param {(angle:number)=>number} o.reach  distance to the first obstacle along a heading
 */
export function createImpactFx({
  fireMaterial, smokeMaterial, origin, field, reach,
  emitters = 144, flames = 3200, haze = 1500, smoke = 520, ash = 220, embers = 160,
  lights: lightCount = 6, reducedMotion = false,
}) {
  const ring = points(flames, fireMaterial, false);
  const hazePts = points(haze, smokeMaterial, true);
  const puff = points(smoke, smokeMaterial, true);
  const flecks = points(ash, smokeMaterial, true);
  const sparks = points(embers, fireMaterial, false);

  let ramp = ['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'].map((h) => new THREE.Color(h));
  const smokeCols = ['#15131d', '#1d1a26', '#221f2b', '#2c2a3a'].map((h) => new THREE.Color(h));
  const hazeCols = ['#2c2a3a', '#35323f', '#403c4a', '#4a4658'].map((h) => new THREE.Color(h));
  const ashCols = ['#8e8a98', '#a9a4b0', '#77737f', '#c4beb4'].map((h) => new THREE.Color(h));
  const tmp = new THREE.Color();
  const white = new THREE.Color('#ffffff');
  const pickCol = (list) => list[Math.floor(Math.random() * list.length)];
  let frame = 0;

  // Curl turbulence is costly; each particle refreshes its sample every third frame.
  function turbulence(P, T, i, t, scale) {
    if ((i + frame) % 3) return;
    const ix = i * 3;
    const c = field.fire(P[ix] - origin.x, P[ix + 1], P[ix + 2] - origin.z, t);
    T[ix] = c.x * scale; T[ix + 1] = c.y * scale; T[ix + 2] = c.z * scale;
  }

  // --- ring emitters ------------------------------------------------------------------
  const eAng = new Float32Array(emitters);
  const eR = new Float32Array(emitters);
  const eSpeed = new Float32Array(emitters);
  const eMax = new Float32Array(emitters);
  const eAge = new Float32Array(emitters).fill(1e3);
  const eLife = new Float32Array(emitters).fill(1);
  const eHit = new Float32Array(emitters);    // time since hitting an obstacle (−1 = not hit)
  const eAcc = new Float32Array(emitters);    // flame emission accumulator
  const eSmoke = new Float32Array(emitters);  // smoke emission accumulator
  const eHeat = new Float32Array(emitters);   // current intensity 0..1+
  let ringActive = false;

  // --- flame tongues (pool) -------------------------------------------------------------
  const F = { pos: ring.geometry.attributes.position.array, col: ring.geometry.attributes.color.array, size: ring.geometry.attributes.size.array };
  const fVel = new Float32Array(flames * 3);
  const fTurb = new Float32Array(flames * 3);
  const fAge = new Float32Array(flames).fill(1e3);
  const fLife = new Float32Array(flames).fill(1);
  const fHeat = new Float32Array(flames);
  let fNext = 0;

  // --- ring smoke (pool) ------------------------------------------------------------------
  const Hz = { pos: hazePts.geometry.attributes.position.array, col: hazePts.geometry.attributes.color.array, size: hazePts.geometry.attributes.size.array, alpha: hazePts.geometry.attributes.alpha.array };
  const hVel = new Float32Array(haze * 3);
  const hTurb = new Float32Array(haze * 3);
  const hAge = new Float32Array(haze).fill(1e3);
  const hLife = new Float32Array(haze).fill(1);
  const hBase = new Float32Array(haze * 3); // smoke color before the firelight tint
  const hSize = new Float32Array(haze);
  let hNext = 0;

  // --- ring lights ----------------------------------------------------------------------
  const lights = Array.from({ length: reducedMotion ? 0 : lightCount }, () => new THREE.PointLight(0xff8a3c, 0, 2.6, 2));

  // --- impact puff, ash, embers ----------------------------------------------------------
  const S = { pos: puff.geometry.attributes.position.array, col: puff.geometry.attributes.color.array, size: puff.geometry.attributes.size.array, alpha: puff.geometry.attributes.alpha.array };
  const sVel = new Float32Array(smoke * 3);
  const sTurb = new Float32Array(smoke * 3);
  const sAge = new Float32Array(smoke).fill(1e3);
  const sLife = new Float32Array(smoke).fill(1);
  const sSize = new Float32Array(smoke);
  const A = { pos: flecks.geometry.attributes.position.array, col: flecks.geometry.attributes.color.array, size: flecks.geometry.attributes.size.array, alpha: flecks.geometry.attributes.alpha.array };
  const aVel = new Float32Array(ash * 3);
  const aAge = new Float32Array(ash).fill(1e3);
  const aLife = new Float32Array(ash).fill(1);
  const aPhase = new Float32Array(ash);
  const E = { pos: sparks.geometry.attributes.position.array, col: sparks.geometry.attributes.color.array, size: sparks.geometry.attributes.size.array };
  const kVel = new Float32Array(embers * 3);
  const kAge = new Float32Array(embers).fill(1e3);
  const kLife = new Float32Array(embers).fill(1);

  function burst() {
    frame = 0;
    if (!reducedMotion) {
      ringActive = true;
      for (let i = 0; i < emitters; i++) {
        const a = (i / emitters) * TAU + (Math.random() - 0.5) * 0.03;
        eAng[i] = a;
        eR[i] = 0.82 + Math.random() * 0.08;
        eSpeed[i] = 3.4 + Math.random() * 1.2;
        eMax[i] = reach ? reach(a) : 4.6;
        eAge[i] = -Math.random() * 0.06;
        eLife[i] = 1.4 + Math.random() * 0.6;
        eHit[i] = -1;
        eAcc[i] = Math.random();
        eSmoke[i] = Math.random();
        eHeat[i] = 1;
      }
    }
    // Billow of fine smoke rolling up and out of the impact.
    for (let i = 0; i < smoke; i++) {
      const ix = i * 3;
      const a = Math.random() * TAU;
      const r = Math.random() * 0.3;
      S.pos[ix] = origin.x + Math.cos(a) * r;
      S.pos[ix + 1] = 0.25 + Math.random() * 0.55;
      S.pos[ix + 2] = origin.z + Math.sin(a) * r;
      const out = 0.25 + Math.random() * 1.0;
      sVel[ix] = Math.cos(a) * out;
      sVel[ix + 1] = 0.5 + Math.random() * 1.1;
      sVel[ix + 2] = Math.sin(a) * out;
      sTurb[ix] = sTurb[ix + 1] = sTurb[ix + 2] = 0;
      sAge[i] = -Math.random() * 0.2;
      sLife[i] = 1.6 + Math.random() * 1.6;
      sSize[i] = Math.random() < 0.7 ? 0.8 : 1.5;
      tmp.copy(pickCol(smokeCols));
      S.col[ix] = tmp.r; S.col[ix + 1] = tmp.g; S.col[ix + 2] = tmp.b;
    }
    // Ash flakes: thrown up, then they flutter down.
    for (let i = 0; i < ash; i++) {
      const ix = i * 3;
      const a = Math.random() * TAU;
      const r = Math.random() * 0.35;
      A.pos[ix] = origin.x + Math.cos(a) * r;
      A.pos[ix + 1] = 0.35 + Math.random() * 0.6;
      A.pos[ix + 2] = origin.z + Math.sin(a) * r;
      const out = 0.4 + Math.random() * 1.3;
      aVel[ix] = Math.cos(a) * out;
      aVel[ix + 1] = 1.2 + Math.random() * 1.8;
      aVel[ix + 2] = Math.sin(a) * out;
      aAge[i] = -Math.random() * 0.2;
      aLife[i] = 2.8 + Math.random() * 2.4;
      aPhase[i] = Math.random() * TAU;
      tmp.copy(pickCol(ashCols));
      A.col[ix] = tmp.r; A.col[ix + 1] = tmp.g; A.col[ix + 2] = tmp.b;
    }
    // Embers: hot sparks that arc up and cool as they fall.
    for (let i = 0; i < embers; i++) {
      const ix = i * 3;
      const a = Math.random() * TAU;
      const r = Math.random() * 0.25;
      E.pos[ix] = origin.x + Math.cos(a) * r;
      E.pos[ix + 1] = 0.3 + Math.random() * 0.5;
      E.pos[ix + 2] = origin.z + Math.sin(a) * r;
      const out = 0.5 + Math.random() * 1.6;
      kVel[ix] = Math.cos(a) * out;
      kVel[ix + 1] = 1.6 + Math.random() * 2.2;
      kVel[ix + 2] = Math.sin(a) * out;
      kAge[i] = -Math.random() * 0.12;
      kLife[i] = 0.8 + Math.random() * 1.1;
    }
  }

  function emit(x, z, heat, climb) {
    const i = fNext;
    fNext = (fNext + 1) % flames;
    const ix = i * 3;
    F.pos[ix] = x + (Math.random() - 0.5) * 0.08;
    F.pos[ix + 1] = 0.04 + Math.random() * 0.04;
    F.pos[ix + 2] = z + (Math.random() - 0.5) * 0.08;
    fVel[ix] = (Math.random() - 0.5) * 0.15;
    fVel[ix + 1] = (0.45 + Math.random() * 0.45) * (0.6 + heat * 0.6) + climb;
    fVel[ix + 2] = (Math.random() - 0.5) * 0.15;
    fTurb[ix] = fTurb[ix + 1] = fTurb[ix + 2] = 0;
    fAge[i] = 0;
    fLife[i] = (0.28 + Math.random() * 0.3) * (0.7 + heat * 0.5) + climb * 0.25;
    fHeat[i] = heat;
  }

  /** Ring smoke, shed just behind the fire front. */
  function emitHaze(ang, r, heat) {
    const i = hNext;
    hNext = (hNext + 1) % haze;
    const ix = i * 3;
    const rr = r - 0.05 - Math.random() * 0.12;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    Hz.pos[ix] = origin.x + ca * rr + (Math.random() - 0.5) * 0.08;
    Hz.pos[ix + 1] = 0.12 + Math.random() * 0.2 + heat * 0.1;
    Hz.pos[ix + 2] = origin.z + sa * rr + (Math.random() - 0.5) * 0.08;
    const out = 0.08 + Math.random() * 0.25;
    hVel[ix] = ca * out;
    hVel[ix + 1] = 0.25 + Math.random() * 0.35;
    hVel[ix + 2] = sa * out;
    hTurb[ix] = hTurb[ix + 1] = hTurb[ix + 2] = 0;
    hAge[i] = 0;
    hLife[i] = 1.3 + Math.random() * 1.1;
    hSize[i] = Math.random() < 0.75 ? 0.8 : 1.5;
    tmp.copy(pickCol(hazeCols));
    hBase[ix] = tmp.r; hBase[ix + 1] = tmp.g; hBase[ix + 2] = tmp.b;
  }

  const lightR = new Float32Array(lightCount);
  const lightHeat = new Float32Array(lightCount);
  const lc = new Float32Array(lightCount);

  function step(dt, t) {
    frame++;
    // --- ring emitters race outward and throw off flame tongues and smoke
    if (ringActive) {
      let alive = false;
      lightR.fill(0); lightHeat.fill(0); lc.fill(0);
      for (let i = 0; i < emitters; i++) {
        if (eAge[i] > eLife[i]) continue;
        alive = true;
        eAge[i] += dt;
        if (eAge[i] < 0) continue;
        const k = Math.min(1, eAge[i] / eLife[i]);
        if (eHit[i] < 0) {
          eSpeed[i] *= Math.exp(-dt * 1.1);
          const next = eR[i] + eSpeed[i] * dt;
          if (next >= eMax[i]) {
            eR[i] = eMax[i];
            eHit[i] = 0;
            eLife[i] = Math.min(eLife[i], eAge[i] + 0.55 + Math.random() * 0.3);
          } else eR[i] = next;
        } else eHit[i] += dt;
        // Burns low as it spreads; flares and climbs where it hits something.
        const flare = eHit[i] >= 0 ? Math.max(0, 1 - eHit[i] / 0.5) : 0;
        eHeat[i] = (1 - k) ** 1.3 + flare * 0.6;
        const x = origin.x + Math.cos(eAng[i]) * eR[i];
        const z = origin.z + Math.sin(eAng[i]) * eR[i];
        eAcc[i] += dt * 120 * eHeat[i];
        while (eAcc[i] >= 1) { eAcc[i] -= 1; emit(x, z, eHeat[i], flare * 0.9); }
        eSmoke[i] += dt * 18 * (0.3 + eHeat[i]);
        while (eSmoke[i] >= 1) { eSmoke[i] -= 1; emitHaze(eAng[i], eR[i], eHeat[i]); }
        // ring lights: average radius and heat per sector
        if (lightCount) {
          const s = Math.floor((eAng[i] / TAU) * lightCount + lightCount) % lightCount;
          lightR[s] += eR[i]; lightHeat[s] += eHeat[i]; lc[s] += 1;
        }
      }
      lights.forEach((l, s) => {
        if (!lc[s]) { l.intensity = 0; return; }
        const a = ((s + 0.5) / lightCount) * TAU;
        const r = lightR[s] / lc[s];
        l.position.set(origin.x + Math.cos(a) * r, 0.3, origin.z + Math.sin(a) * r);
        l.color.copy(ramp[1]).lerp(white, 0.3);
        const heat = lightHeat[s] / lc[s];
        l.intensity = Number.isFinite(heat) ? heat * 2.6 : 0;
      });
      if (!alive) { ringActive = false; for (const l of lights) l.intensity = 0; }
    }

    // --- flame tongues: rise and curl through the bonfire's noise, cooling as they go
    let anyFlame = false;
    for (let i = 0; i < flames; i++) {
      if (fAge[i] > fLife[i]) { F.size[i] = 0; continue; }
      anyFlame = true;
      fAge[i] += dt;
      const ix = i * 3;
      const k = Math.min(1, fAge[i] / fLife[i]);
      turbulence(F.pos, fTurb, i, t, 0.5 * Math.min(1, 0.3 + F.pos[ix + 1] * 3));
      const slow = 1 - 0.5 * k;
      F.pos[ix] += (fVel[ix] + fTurb[ix]) * slow * dt;
      F.pos[ix + 1] += (fVel[ix + 1] + fTurb[ix + 1] * 0.4) * slow * dt;
      F.pos[ix + 2] += (fVel[ix + 2] + fTurb[ix + 2]) * slow * dt;
      const heat = Math.max(0, (1 - k) ** 1.2 * (0.55 + fHeat[i] * 0.5));
      const h = Math.min(0.999, heat) * 3;
      const j = Math.floor(h);
      const fade = Math.min(1, (1 - k) * 3);
      tmp.copy(ramp[j]).lerp(ramp[j + 1], h - j).multiplyScalar(0.34 * (0.4 + heat) * fade * fade);
      F.col[ix] = tmp.r; F.col[ix + 1] = tmp.g; F.col[ix + 2] = tmp.b;
      F.size[i] = fade < 0.08 ? 0 : heat > 0.5 ? 2 : 1;
    }
    if (anyFlame) {
      ring.geometry.attributes.position.needsUpdate = true;
      ring.geometry.attributes.color.needsUpdate = true;
      ring.geometry.attributes.size.needsUpdate = true;
    }

    // --- ring smoke: rises off the flames, lit from below at first, then drifts and thins
    let anyHaze = false;
    for (let i = 0; i < haze; i++) {
      if (hAge[i] > hLife[i]) { Hz.size[i] = 0; continue; }
      anyHaze = true;
      hAge[i] += dt;
      const ix = i * 3;
      const k = Math.min(1, hAge[i] / hLife[i]);
      turbulence(Hz.pos, hTurb, i, t, 0.3);
      const drag = Math.exp(-dt * 0.9);
      hVel[ix] *= drag; hVel[ix + 1] = hVel[ix + 1] * drag + 0.12 * dt; hVel[ix + 2] *= drag;
      Hz.pos[ix] += (hVel[ix] + hTurb[ix]) * dt;
      Hz.pos[ix + 1] += (hVel[ix + 1] + hTurb[ix + 1] * 0.5) * dt;
      Hz.pos[ix + 2] += (hVel[ix + 2] + hTurb[ix + 2]) * dt;
      tmp.setRGB(hBase[ix], hBase[ix + 1], hBase[ix + 2]).lerp(ramp[0], 0.55 * (1 - k) ** 2);
      Hz.col[ix] = tmp.r; Hz.col[ix + 1] = tmp.g; Hz.col[ix + 2] = tmp.b;
      Hz.size[i] = hSize[i];
      Hz.alpha[i] = 0.75 * Math.min(1, hAge[i] * 6) * (1 - k) ** 1.4;
    }
    if (anyHaze) {
      for (const a of ['position', 'color', 'size', 'alpha']) hazePts.geometry.attributes[a].needsUpdate = true;
    }

    // --- impact smoke: billows up and out, slows, curls and thins
    let anySmoke = false;
    for (let i = 0; i < smoke; i++) {
      if (sAge[i] > sLife[i]) { S.size[i] = 0; continue; }
      anySmoke = true;
      sAge[i] += dt;
      if (sAge[i] < 0) { S.size[i] = 0; continue; }
      const ix = i * 3;
      const k = Math.min(1, sAge[i] / sLife[i]);
      turbulence(S.pos, sTurb, i, t, 0.35);
      const drag = Math.exp(-dt * 1.2);
      sVel[ix] *= drag; sVel[ix + 1] = sVel[ix + 1] * drag + 0.16 * dt; sVel[ix + 2] *= drag;
      S.pos[ix] += (sVel[ix] + sTurb[ix]) * dt;
      S.pos[ix + 1] += (sVel[ix + 1] + sTurb[ix + 1] * 0.5) * dt;
      S.pos[ix + 2] += (sVel[ix + 2] + sTurb[ix + 2]) * dt;
      S.size[i] = sSize[i];
      S.alpha[i] = 0.65 * (1 - k) ** 1.3 * Math.min(1, sAge[i] * 8);
    }

    // --- ash: thrown up, then flutters down (rocking side to side) and settles
    let anyAsh = false;
    for (let i = 0; i < ash; i++) {
      if (aAge[i] > aLife[i]) { A.size[i] = 0; continue; }
      anyAsh = true;
      aAge[i] += dt;
      if (aAge[i] < 0) { A.size[i] = 0; continue; }
      const ix = i * 3;
      const k = Math.min(1, aAge[i] / aLife[i]);
      if (A.pos[ix + 1] > 0.03) {
        const drag = Math.exp(-dt * 1.8);
        const rock = Math.sin(aAge[i] * 5.5 + aPhase[i]);
        aVel[ix] = aVel[ix] * drag + rock * Math.cos(aPhase[i]) * 0.9 * dt;
        aVel[ix + 1] = Math.max(-0.28, aVel[ix + 1] * drag - 0.55 * dt); // flakes fall slowly
        aVel[ix + 2] = aVel[ix + 2] * drag + rock * Math.sin(aPhase[i]) * 0.9 * dt;
        A.pos[ix] += aVel[ix] * dt; A.pos[ix + 1] += aVel[ix + 1] * dt; A.pos[ix + 2] += aVel[ix + 2] * dt;
        if (A.pos[ix + 1] <= 0.03) { A.pos[ix + 1] = 0.03; aVel[ix] = aVel[ix + 1] = aVel[ix + 2] = 0; }
      }
      A.size[i] = 0.8;
      A.alpha[i] = k > 0.8 ? (1 - k) / 0.2 * 0.9 : 0.9;
    }
    for (const [p, any] of [[puff, anySmoke], [flecks, anyAsh]]) {
      if (!any) continue;
      for (const a of ['position', 'color', 'size', 'alpha']) p.geometry.attributes[a].needsUpdate = true;
    }

    // --- embers: arc up and out, cool from bright to deep as they fall
    let anyEmber = false;
    for (let i = 0; i < embers; i++) {
      if (kAge[i] > kLife[i]) { E.size[i] = 0; continue; }
      anyEmber = true;
      kAge[i] += dt;
      if (kAge[i] < 0) { E.size[i] = 0; continue; }
      const ix = i * 3;
      const k = Math.min(1, kAge[i] / kLife[i]);
      const drag = Math.exp(-dt * 1.4);
      kVel[ix] *= drag; kVel[ix + 1] = kVel[ix + 1] * drag - 1.3 * dt; kVel[ix + 2] *= drag;
      E.pos[ix] += kVel[ix] * dt; E.pos[ix + 1] += kVel[ix + 1] * dt; E.pos[ix + 2] += kVel[ix + 2] * dt;
      if (E.pos[ix + 1] < 0.02) { E.pos[ix + 1] = 0.02; kVel[ix + 1] *= -0.3; kVel[ix] *= 0.5; kVel[ix + 2] *= 0.5; }
      const heat = 1 - k;
      const h = heat * 1.999;
      const j = Math.floor(h);
      tmp.copy(ramp[j]).lerp(ramp[j + 1], h - j).multiplyScalar(0.55 + heat * 0.6);
      E.col[ix] = tmp.r; E.col[ix + 1] = tmp.g; E.col[ix + 2] = tmp.b;
      E.size[i] = 1;
    }
    if (anyEmber) {
      for (const a of ['position', 'color', 'size']) sparks.geometry.attributes[a].needsUpdate = true;
    }
  }

  return {
    ring,
    haze: hazePts,
    puff,
    flecks,
    embers: sparks,
    lights,
    burst,
    step,
    /** Particle sets for the cursor interaction. */
    sets: [
      { pos: F.pos, vel: fVel, n: flames, geo: ring.geometry, maxV: 1.4 },
      { pos: Hz.pos, vel: hVel, n: haze, geo: hazePts.geometry, maxV: 1.2 },
      { pos: S.pos, vel: sVel, n: smoke, geo: puff.geometry, maxV: 1.4 },
      { pos: A.pos, vel: aVel, n: ash, geo: flecks.geometry, maxV: 1.6 },
      { pos: E.pos, vel: kVel, n: embers, geo: sparks.geometry, maxV: 2 },
    ],
    setRamp(hexes) { ramp = hexes.map((h) => new THREE.Color(h)); },
  };
}
