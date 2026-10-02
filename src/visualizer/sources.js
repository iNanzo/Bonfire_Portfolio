// Bonfire Live's sound: one audio context for the page's whole life (the analyser hears it
// through a delay as long as the speakers' latency, so the fire moves with what the room
// hears) and the source playing into it: a line in or a mic (no echo cancelling or auto
// gain), a shared tab or the whole system's audio, a file, or the synthesized demo. A new
// source takes over from the last; the start screen lists the inputs to pick from.
import { createAnalyser } from './analyser.js';
import { saveSettings } from './settings.js';
import { createDemo, DEMO_BPM } from './demo.js';
import { q } from '../ui/shell.js';
import { esc } from '../html.js';

/**
 * The sound's part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createSources(ctx) {
  const { settings } = ctx;

  function openEngine() {
    if (!ctx.engine) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const audio = new AC({ latencyHint: 'interactive' });
      const analyser = createAnalyser(audio);
      const delay = audio.createDelay(1);
      delay.connect(analyser.node);
      const monitor = audio.createGain();
      monitor.gain.value = settings.volume;
      monitor.connect(audio.destination);
      ctx.engine = { ctx: audio, analyser, delay, monitor, source: null };
    }
    return ctx.engine;
  }

  const NO_PROCESSING = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

  async function openInput(e, deviceId) {
    const constraints = (id) => ({ audio: { ...NO_PROCESSING, channelCount: { ideal: 2 }, ...(id ? { deviceId: { exact: id } } : {}) } });
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints(deviceId));
    } catch (error) {
      if (!deviceId || error.name !== 'OverconstrainedError') throw error;
      stream = await navigator.mediaDevices.getUserMedia(constraints(''));
    }
    const node = e.ctx.createMediaStreamSource(stream);
    node.connect(e.delay);
    const track = stream.getAudioTracks()[0];
    settings.deviceId = track?.getSettings?.().deviceId ?? deviceId ?? '';
    saveSettings(settings);
    return {
      kind: 'input', name: track?.label || 'Audio input', track,
      stop() { node.disconnect(); stream.getTracks().forEach((t) => t.stop()); },
    };
  }

  async function openCapture(e) {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser can’t share tab or system audio. Try Chrome or Edge on a computer.');
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { ...NO_PROCESSING, suppressLocalAudioPlayback: false },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('No sound was shared. Share again, and turn on “Share tab audio” (for a tab) or “Share system audio” (for your screen).');
    }
    stream.getVideoTracks().forEach((t) => t.stop()); // only the sound is needed
    const node = e.ctx.createMediaStreamSource(new MediaStream([track]));
    node.connect(e.delay);
    return {
      kind: 'capture', name: track.label || 'Shared audio', track,
      stop() { node.disconnect(); track.stop(); },
    };
  }

  function openFile(e, file) {
    const media = new Audio();
    media.src = URL.createObjectURL(file);
    const node = e.ctx.createMediaElementSource(media);
    node.connect(e.delay);
    node.connect(e.monitor);
    return media.play().then(() => ({
      kind: 'file', name: file.name.replace(/\.[a-z0-9]+$/i, ''), media, playback: true,
      stop() { media.pause(); node.disconnect(); URL.revokeObjectURL(media.src); },
    }));
  }

  function openDemo(e) {
    const bus = e.ctx.createGain();
    bus.connect(e.delay);
    bus.connect(e.monitor);
    const demo = createDemo(e.ctx, bus);
    demo.start();
    return { kind: 'demo', name: `Demo Track · ${DEMO_BPM} BPM`, demo, playback: true, stop() { demo.stop(); bus.disconnect(); } };
  }

  /** The sound goes (Change, a shared track ending, another source): the show as if it fell silent. */
  function stopSource() {
    if (!ctx.engine?.source) return;
    ctx.engine.source.stop();
    ctx.engine.source = null;
    ctx.engine.analyser.reset(); // (silent again, without a 'silence' event of its own)
    ctx.heard.clear();
    ctx.director?.silence();
  }

  let busy = false;
  async function useSource(kind, { file = null } = {}) {
    if (busy) return;
    busy = true;
    ctx.hideError();
    const e = openEngine(); // created inside the click, so the browser lets it play
    try {
      const resumed = e.ctx.resume();
      stopSource();
      const source = kind === 'input' ? await openInput(e, settings.deviceId)
        : kind === 'capture' ? await openCapture(e)
        : kind === 'file' ? await openFile(e, file)
        : openDemo(e);
      await resumed;
      // What plays through the speakers is heard after the output latency; delay the
      // analysis by as much so the fire moves with what the room hears.
      const latency = source.playback ? Math.min(0.5, e.ctx.outputLatency || e.ctx.baseLatency || 0.02) : 0;
      e.delay.delayTime.value = latency;
      e.analyser.reset();
      ctx.heard.clear();
      e.source = source;
      source.track?.addEventListener('ended', () => {
        if (e.source !== source) return;
        stopSource();
        ctx.showStart('The shared sound stopped. Pick a source to carry on.');
      });
      if (kind === 'input') await listDevices();
      ctx.goLive();
    } catch (error) {
      ctx.showError(describeError(error, kind));
    } finally {
      busy = false;
    }
  }

  function describeError(error, kind) {
    if (error?.name === 'NotAllowedError') {
      return kind === 'capture' ? 'Sharing was cancelled or blocked.' : 'The browser wasn’t allowed to use the microphone or line in. Allow it in the address bar’s site settings and try again.';
    }
    if (error?.name === 'NotFoundError') return 'No audio input was found. Plug in your interface or mic and try again.';
    if (error?.name === 'NotReadableError') return 'That input is busy or unavailable (another app may have it exclusively).';
    if (kind === 'file') return error?.name === 'NotAllowedError' ? 'The browser held the sound back. Click the page once, then try the file again.' : 'That file couldn’t be played. Try an MP3, WAV, AAC or FLAC file.';
    return error?.message || 'Something went wrong starting the sound.';
  }

  async function listDevices() {
    const row = q('[data-device-row]');
    const sel = q('[data-device]');
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId);
      if (!inputs.length || !inputs[0].label) { row.hidden = true; return; }
      sel.innerHTML = inputs.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label)}</option>`).join('');
      sel.value = settings.deviceId && inputs.some((d) => d.deviceId === settings.deviceId) ? settings.deviceId : inputs[0].deviceId;
      row.hidden = false;
    } catch { row.hidden = true; }
  }
  q('[data-device]').addEventListener('change', (e) => {
    settings.deviceId = e.target.value;
    saveSettings(settings);
    if (ctx.engine?.source?.kind === 'input') useSource('input');
  });

  return { useSource, stopSource, listDevices };
}
