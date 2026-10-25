// The campfire game's round timer: a countdown on the laptop's clock, kept as data so it
// survives a reload. idle: set, not started (remainingMs = durationMs); running: a `deadline`
// (epoch ms); paused: what was left (remainingMs). Reaching zero only shows on the screen:
// nothing moves on by itself. Pure; `now` is always passed in (Date.now() in the page).
//
//   newTimer(ms)              idle at ms
//   toggle(t, now)            start, pause or resume (Space)
//   addTime(t, ms, now)       more time, in any state
//   remaining(t, now)         the ms left (never negative)
//   expired(t, now)           started and at zero

/**
 * @typedef {{ status: 'idle'|'running'|'paused', durationMs: number, deadline: number|null, remainingMs: number|null }} Timer
 */

/** The longest a round's countdown may be: 3 hours. */
export const MAX_TIMER_MS = 3 * 60 * 60 * 1000;

/**
 * A countdown set but not started.
 * @param {number} ms
 * @returns {Timer}
 */
export function newTimer(ms) {
  const d = Number.isFinite(ms) ? Math.min(MAX_TIMER_MS, Math.max(0, Math.round(ms))) : 0;
  return { status: 'idle', durationMs: d, deadline: null, remainingMs: d };
}

/**
 * Starts an idle timer or resumes a paused one (deadline = now + what's left); pauses a running
 * one (remainingMs = what's left).
 * @param {Timer} t
 * @param {number} now
 * @returns {Timer}
 */
export function toggle(t, now) {
  if (t.status === 'running') return { ...t, status: 'paused', deadline: null, remainingMs: remaining(t, now) };
  return { ...t, status: 'running', deadline: now + (t.remainingMs ?? t.durationMs), remainingMs: null };
}

/**
 * Adds `ms` (a positive whole number) in any state: running moves the deadline (from now if it
 * had run out, so the full `ms` is added), otherwise remainingMs grows; durationMs grows too.
 * Anything else for `ms` leaves the timer as it was.
 * @param {Timer} t
 * @param {number} ms
 * @param {number} now
 * @returns {Timer}
 */
export function addTime(t, ms, now) {
  if (!Number.isSafeInteger(ms) || ms <= 0) return t;
  const durationMs = Math.min(MAX_TIMER_MS, t.durationMs + ms);
  if (t.status === 'running') return { ...t, durationMs, deadline: Math.max(t.deadline ?? now, now) + ms };
  return { ...t, durationMs, remainingMs: Math.min(MAX_TIMER_MS, (t.remainingMs ?? 0) + ms) };
}

/**
 * The ms left: running max(0, deadline − now), otherwise remainingMs.
 * @param {Timer} t
 * @param {number} now
 */
export function remaining(t, now) {
  if (t.status === 'running') return Math.max(0, (t.deadline ?? now) - now);
  return Math.max(0, t.remainingMs ?? 0);
}

/**
 * Whether a started timer is at zero (a paused one at zero too).
 * @param {Timer} t
 * @param {number} now
 */
export function expired(t, now) {
  return t.status !== 'idle' && remaining(t, now) === 0;
}

/**
 * The clock as people read it: m:ss, or h:mm:ss from an hour. Rounds up, so 0:00 shows only
 * at zero.
 * @param {number} ms
 */
export function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * A timer read back from storage: a valid one, or a fresh idle one at `fallbackMs`.
 * @param {any} raw
 * @param {number} fallbackMs
 * @returns {Timer}
 */
export function cleanTimer(raw, fallbackMs) {
  const t = newTimer(Number(raw?.durationMs ?? fallbackMs));
  if (raw?.status === 'running' && Number.isFinite(raw.deadline))
    return { ...t, status: 'running', deadline: raw.deadline, remainingMs: null };
  if (raw?.status === 'paused' && Number.isFinite(raw.remainingMs))
    return { ...t, status: 'paused', remainingMs: Math.min(MAX_TIMER_MS, Math.max(0, raw.remainingMs)) };
  if (raw?.status === 'idle' && Number.isFinite(raw.remainingMs))
    return { ...t, remainingMs: Math.min(MAX_TIMER_MS, Math.max(0, raw.remainingMs)) };
  return t;
}
