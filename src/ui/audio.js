// Synthesized audio — no downloaded files. Muted by default.
//   ambience: filtered noise bed + random crackle pops (fire)
//   blips: short square-wave UI sounds
//   the swap: a scrape as the blade is drawn, a hum that rises while the new one is
//   forged (forgeHum), a shimmer as it forms, then the element's own impact: fire
//   thumps and crackles, lightning snaps and buzzes, ice rings and shatters.

let ctx = null;
let master = null;
let ambience = null;
let enabled = false;
let crackleTimer = null;

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return ctx;
}

function noiseBuffer(seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    // brown-ish noise: warmer than white noise
    last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;
    d[i] = last * 3;
  }
  return buf;
}

function startAmbience() {
  if (ambience) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(3);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  const gain = ctx.createGain();
  gain.gain.value = 0.16;
  src.connect(filter).connect(gain).connect(master);
  src.start();
  ambience = { src, gain };
}

function scheduleCrackle() {
  clearTimeout(crackleTimer);
  crackleTimer = setTimeout(() => {
    if (!enabled) return;
    pop(0.02 + Math.random() * 0.05);
    scheduleCrackle();
  }, 60 + Math.random() * 420);
}

function pop(vol) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 0.012);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1400 + Math.random() * 2400;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(hp).connect(g).connect(master);
  src.start(t);
}

/** A burst of noise through a band-pass filter sweeping from f0 to f1 (Hz). */
function hiss(start, dur, vol, f0, f1, q = 4) {
  const src = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, start);
  bp.frequency.exponentialRampToValueAtTime(f1, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(start);
}

function tone(freq, start, dur, vol, type = 'square') {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.02);
}

export function setSound(on) {
  enabled = on;
  if (on) {
    if (!ensureContext()) { enabled = false; return false; }
    // The loop is reusable, but muting cancels its timer. Restart scheduling on
    // every enable; scheduleCrackle first clears the previous timer.
    ctx.resume().catch(() => { /* A later user gesture can retry suspended audio. */ });
    startAmbience();
    scheduleCrackle();
    master.gain.setTargetAtTime(0.6, ctx.currentTime, 0.1);
  } else if (ctx) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    clearTimeout(crackleTimer);
    crackleTimer = null;
  }
  return enabled;
}

/**
 * A hum that rises in pitch and warmth for `seconds` while a new weapon is forged.
 * Returns stop(): the hum fades out at once (the impact came early, or was skipped to).
 */
export function forgeHum(seconds) {
  if (!enabled || !ctx) return () => {};
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o2.type = 'triangle';
  o.frequency.setValueAtTime(55, t);
  o.frequency.exponentialRampToValueAtTime(110, t + seconds);
  o2.frequency.setValueAtTime(110, t);
  o2.frequency.exponentialRampToValueAtTime(330, t + seconds);
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(1800, t + seconds);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.4);
  g.gain.setValueAtTime(0.03, t + Math.max(0.4, seconds - 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.1);
  o.connect(lp); o2.connect(lp); lp.connect(g).connect(master);
  o.start(t); o2.start(t);
  o.stop(t + seconds + 0.2); o2.stop(t + seconds + 0.2);
  return () => {
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(0.0001, now, 0.03);
    o.stop(now + 0.2); o2.stop(now + 0.2);
  };
}

export function blip(kind = 'move') {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime;
  if (kind === 'move') tone(660, t, 0.05, 0.05);
  else if (kind === 'select') { tone(523, t, 0.06, 0.06); tone(784, t + 0.06, 0.09, 0.06); }
  else if (kind === 'back') { tone(523, t, 0.06, 0.05); tone(392, t + 0.06, 0.08, 0.05); }
  else if (kind === 'stoke') {
    tone(110, t, 0.25, 0.18, 'triangle');
    for (let i = 0; i < 6; i++) setTimeout(() => enabled && pop(0.08), i * 40 + Math.random() * 30);
  } else if (kind === 'pull') {
    // Blade drawn from the ashes: a falling scrape.
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.6);
  } else if (kind === 'stab') {
    // Driven into the ground: a thump, a ring of steel, a rush of sparks.
    tone(70, t, 0.3, 0.22, 'triangle');
    tone(1320, t, 0.35, 0.03, 'square');
    tone(1980, t + 0.01, 0.25, 0.015, 'square');
    for (let i = 0; i < 8; i++) setTimeout(() => enabled && pop(0.07), i * 35 + Math.random() * 30);
  } else if (kind === 'stab-lightning') {
    // A snap, a buzz that dies away, and a few crackles.
    hiss(t, 0.08, 0.2, 5000, 1500, 1.5);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t);
    o.frequency.linearRampToValueAtTime(90, t + 0.4);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.5);
    tone(70, t, 0.25, 0.18, 'triangle');
    for (let i = 0; i < 6; i++) setTimeout(() => enabled && pop(0.09), 40 + i * 50 + Math.random() * 40);
  } else if (kind === 'stab-ice') {
    // A glassy ring (inharmonic partials) over a cold hiss, and shards tinkling after.
    tone(70, t, 0.25, 0.16, 'triangle');
    [1568, 2349, 3322].forEach((f, i) => tone(f, t + i * 0.015, 0.9 - i * 0.2, 0.025, 'sine'));
    hiss(t, 0.6, 0.05, 6000, 2500, 2);
    for (let i = 0; i < 5; i++) tone(2600 + Math.random() * 1800, t + 0.15 + i * 0.07 + Math.random() * 0.05, 0.12, 0.012, 'sine');
  } else if (kind === 'form') {
    // The new blade takes shape: a quick rising shimmer.
    [523, 784, 1047, 1568].forEach((f, i) => tone(f, t + i * 0.04, 0.25, 0.018, 'triangle'));
  } else if (kind === 'zap') {
    hiss(t, 0.06, 0.1, 6000, 2000, 1.5);
  } else if (kind === 'chime') {
    tone(2093, t, 0.4, 0.02, 'sine');
    tone(3136, t + 0.02, 0.3, 0.012, 'sine');
  } else if (kind === 'kindle') {
    [392, 523, 659, 784].forEach((f, i) => tone(f, t + i * 0.12, 0.5, 0.035, 'triangle'));
  }
}
