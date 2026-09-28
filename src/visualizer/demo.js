// A demo track, synthesized (no audio files): 126 BPM, a 32-bar loop shaped like a
// DJ tune so every reaction gets exercised.
//   bars  0–7   kick and hats
//   bars  8–15  + clap and bassline
//   bars 16–23  breakdown: no kick or bass, a pad and a riser (the forge)
//   bars 24–31  the drop: everything, open hats
// Scheduled a little ahead on the audio clock, like any Web Audio sequencer.

export const DEMO_BPM = 126;
const BARS = 32;

export function createDemo(ctx, output) {
  const beat = 60 / DEMO_BPM;
  const step = beat / 4; // 16th notes
  const master = ctx.createGain();
  master.gain.value = 0.6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(output);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noiseSource = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; return s; };

  function env(gain, t, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    env(g, t, 1, 0.002, 0.32);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.4);
  }
  function hat(t, open = false) {
    const s = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain();
    env(g, t, open ? 0.22 : 0.16, 0.001, open ? 0.22 : 0.035);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random()); s.stop(t + 0.3);
  }
  function clap(t) {
    const s = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const [dt, v] of [[0, 0.5], [0.012, 0.35], [0.024, 0.55]]) {
      g.gain.exponentialRampToValueAtTime(v, t + dt + 0.001);
      g.gain.exponentialRampToValueAtTime(0.05, t + dt + 0.01);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random()); s.stop(t + 0.25);
  }
  function bass(t, freq) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    const g = ctx.createGain();
    env(g, t, 0.32, 0.005, 0.2);
    o.connect(f).connect(g).connect(master);
    o.start(t); o.stop(t + 0.25);
  }
  function pad(t, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 1.5);
    g.gain.setValueAtTime(0.09, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur);
    f.connect(g).connect(master);
    for (const hz of [220, 261.63, 329.63, 440]) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = det;
        o.connect(f);
        o.start(t); o.stop(t + dur);
      }
    }
  }
  function riser(t, dur) {
    const s = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
    s.connect(f).connect(g).connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const BASSLINE = [55, 55, 65.41, 49];
  let next = 0; // next 16th to schedule
  let startAt = 0;
  let timer = 0;
  function schedule() {
    while (startAt + next * step < ctx.currentTime + 0.15) {
      const t = startAt + next * step;
      const s = next % 16;
      const bar = Math.floor(next / 16) % BARS;
      const drop = bar >= 24;
      const breakdown = bar >= 16 && bar < 24;
      if (!breakdown) {
        if (s % 4 === 0) kick(t);
        if (s % 4 === 2) hat(t, drop);
        else if (bar >= 8 && s % 2 === 1) hat(t);
        if (bar >= 8 && (s === 4 || s === 12)) clap(t);
        if (bar >= 8 && s % 4 === 2) bass(t, BASSLINE[Math.floor(bar / 2) % 4]);
      } else {
        if (bar === 16 && s === 0) pad(t, 8 * 16 * step);
        if (bar === 20 && s === 0) riser(t, 4 * 16 * step);
        // A snare roll speeding up into the drop.
        if (bar >= 22 && (bar === 23 ? s % 1 === 0 : s % 2 === 0)) clap(t);
      }
      next++;
    }
  }

  return {
    start() {
      startAt = ctx.currentTime + 0.1;
      next = 0;
      schedule();
      timer = setInterval(schedule, 25);
    },
    stop() {
      clearInterval(timer);
      master.disconnect();
    },
    /** Where the loop is: bar 0–31 and a label for the section. */
    position() {
      const bar = Math.floor(Math.max(0, ctx.currentTime - startAt) / (beat * 4)) % BARS;
      return { bar, section: bar < 8 ? 'Intro' : bar < 16 ? 'Groove' : bar < 24 ? 'Breakdown' : 'Drop' };
    },
  };
}
