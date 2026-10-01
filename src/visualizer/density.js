// How many particles Bonfire Live draws, and the Bonfire Painter with it (it plays the same
// show, so what you paint is what plays): more than the site, since here the fire is the
// show. The Particles setting (normal | more | max) scales the site's own counts
// (effects.js); the counts size the scene's GPU buffers, so a new level means a rebuilt
// scene. Pure (no three.js, no DOM): both pages import it.

/** Per Particles setting: each count as a multiple of the site's. */
export const DENSITY = Object.freeze({
  normal: Object.freeze({ fire: 1, sparks: 1, forge: 1, impact: 1, flies: 1 }),
  more: Object.freeze({ fire: 1.6, sparks: 3, forge: 1.5, impact: 1.3, flies: 1.2 }),
  max: Object.freeze({ fire: 2.4, sparks: 5, forge: 2, impact: 1.7, flies: 1.5 }),
});

/**
 * The particle and firefly counts at `level` (a DENSITY key; anything else: 'more', Bonfire
 * Live's default), from the site's own counts. `base` is left as it is.
 * @param {{ particles: { fire: number, sparks: number, forge: number, impact: number }, fireflies: { count: number, lights?: number } }} base
 * @param {string} [level]
 * @returns {{ particles: { fire: number, sparks: number, forge: number, impact: number }, fireflies: { count: number, lights?: number } }}
 */
export function densityCounts(base, level = 'more') {
  const k = Object.hasOwn(DENSITY, level) ? DENSITY[level] : DENSITY.more;
  const p = base.particles;
  return {
    particles: { fire: Math.round(p.fire * k.fire), sparks: Math.round(p.sparks * k.sparks), forge: Math.round(p.forge * k.forge), impact: p.impact * k.impact },
    fireflies: { count: Math.round(base.fireflies.count * k.flies), lights: base.fireflies.lights },
  };
}
