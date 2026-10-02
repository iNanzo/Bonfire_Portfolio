// The pixel sizes a render menu steps through (screen pixels to one of the picture's): one
// list for the site's P menu (bonfire/sceneRender.js), Bonfire Live's and the Painter's
// (visualizer/render.js PIXEL_SIZES, which a test keeps equal to this). It lives apart
// from both so the scene engine needn't import Bonfire Live's modules for it.

/** Smallest to largest; the site's own sizes (effects.render) are among them too (contentRules checks). */
export const PIXEL_SIZES = [2, 3, 4, 6, 8];
