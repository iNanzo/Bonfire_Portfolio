// Recording a clip (V): the picture, scaled up with hard pixel edges to about 1080 lines,
// with the sound the visualizer hears, saved as a video file when it stops. For sharing a
// set, and for the portfolio's Bonfire Live page (its gallery plays clips).
//
// Each frame is copied right after the scene draws it (scene.onRendered), so the WebGL
// canvas needs no preserved buffer; at most 60 a second (the clip's own rate: on a 120 or
// 144 Hz display the copies in between would only be thrown away, after a scaled draw each).
// MP4 where the browser records it (Chrome and Edge do), otherwise WebM. The title cards are
// HTML over the picture, so they aren't in it.

const TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** The first container/codec pair this browser can record, or ''. */
export function recordType(isSupported = (t) => globalThis.MediaRecorder?.isTypeSupported?.(t)) {
  return TYPES.find((t) => isSupported(t)) ?? '';
}

/** The scale that brings `height` rows to about 1080 (a whole number, so pixels stay square). */
export const recordScale = (height) => Math.max(1, Math.round(1080 / Math.max(1, height)));

/** The clip's frame rate: the most frames a second it copies. */
const RECORD_FPS = 60;

/**
 * A gate that lets a frame through at most `fps` times a second (`now` in ms): each one is due
 * an interval after the last was due, so a faster display averages `fps` without drifting; a
 * frame up to 1 ms early counts (display timestamps jitter); after a stall it starts over.
 * @param {number} [fps]
 * @returns {(now: number) => boolean}
 */
export function frameEvery(fps = RECORD_FPS) {
  const interval = 1000 / fps;
  let next = -Infinity;
  return (now) => {
    if (now < next - 1) return false;
    next = now - next > interval ? now + interval : next + interval;
    return true;
  };
}

/**
 * @param {object} o
 * @param {() => ({ canvas: HTMLCanvasElement, onRendered: (fn: () => void) => () => void } | null)} o.scene
 * @param {() => ({ ctx: AudioContext, node: AudioNode } | null)} o.audio  what to record the sound from
 * @param {(state: { recording: boolean, seconds: number, saved?: string, error?: string }) => void} o.onState
 */
export function createRecorder({ scene, audio, onState }) {
  let rec = null;
  let stopFrames = () => {};
  let tick = 0;
  let began = 0;
  let sink = null;

  function start() {
    const s = scene();
    const type = recordType();
    if (!s || !type || !window.MediaRecorder) { onState({ recording: false, seconds: 0, error: 'This browser can’t record video' }); return false; }
    const src = s.canvas;
    const out = document.createElement('canvas');
    const g = out.getContext('2d');
    const fit = () => {
      const k = recordScale(src.height);
      // (Even sizes: video encoders want them.)
      const w = (src.width * k) & ~1, h = (src.height * k) & ~1;
      if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
      g.imageSmoothingEnabled = false;
    };
    fit();
    const due = frameEvery(RECORD_FPS);
    stopFrames = s.onRendered(() => {
      if (!due(performance.now())) return;
      fit();
      g.drawImage(src, 0, 0, out.width, out.height);
    });
    const stream = out.captureStream(RECORD_FPS);
    const a = audio();
    if (a) {
      sink = a.ctx.createMediaStreamDestination();
      a.node.connect(sink);
      for (const track of sink.stream.getAudioTracks()) stream.addTrack(track);
    }
    const chunks = [];
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16e6, audioBitsPerSecond: 192e3 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (sink && a) { try { a.node.disconnect(sink); } catch { /* already gone */ } }
      sink = null;
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      const name = `bonfire-live-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      onState({ recording: false, seconds: 0, saved: name });
    };
    rec.start(1000);
    began = performance.now();
    clearInterval(tick);
    tick = setInterval(() => onState({ recording: true, seconds: Math.floor((performance.now() - began) / 1000) }), 500);
    onState({ recording: true, seconds: 0 });
    return true;
  }

  function stop() {
    if (!rec) return;
    clearInterval(tick);
    stopFrames();
    stopFrames = () => {};
    if (rec.state !== 'inactive') rec.stop();
    rec = null;
  }

  return {
    get recording() { return !!rec; },
    toggle() { if (rec) stop(); else start(); },
    stop,
  };
}
