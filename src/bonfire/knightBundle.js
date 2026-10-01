// What scene.js loads of the knight when it fetches his model: the knights themselves
// (knights.js, and his poses, knightPose.js), his comings and goings (knightArrival.js) and
// his summon sign (summonSign.js). One dynamic import, so they're a chunk of their own that
// loads alongside knight.glb, off the fire's own first load (the fire burns without him if
// either fails). What the rest of the scene needs of him up front (the armor's shared
// uniforms, the seats, the styles) stays in the scene's chunk.
export { createKnights, templateSteps } from './knights.js';
export { createKnightArrival } from './knightArrival.js';
export { createSummonSign } from './summonSign.js';
