// NEWT's four dialogue faces (sad, angry, shy, smug: clips.js EXTRA_FACES) as edits of his smooth
// neutral face, for tools/newt-face-smooth.mjs (the 1024 sheet) and tools/newt-face.mjs (the
// pixel sheets): the neutral face measured off the glb's NEWT_Face sheet (NEUTRAL), and each new
// face's brow, lid, hook, white, iris and pupil, lash, mouth and blush. Units are pixels of one of
// the 1024 sheet's 512 cells: x across from the middle of his face (the cell's left edge: the
// face mirrors about it) to his ear, y down. A stroke is its centre line and its width.

/** One cell of the smooth sheet, pixels: the unit everything here is in. */
export const CELL = 512;

/**
 * Points along a quadratic curve from p0 to p1 bent toward c (n segments).
 * @param {number[]} p0
 * @param {number[]} c
 * @param {number[]} p1
 * @param {number} [n]
 * @returns {number[][]}
 */
export function curve(p0, c, p1, n = 10) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * t * (1 - t);
    return [a * p0[0] + b * c[0] + t * t * p1[0], a * p0[1] + b * c[1] + t * t * p1[1]];
  });
}

/**
 * @typedef {object} Stroke
 * @property {number[][]} pts  its centre line
 * @property {number} w  its width
 * @typedef {object} Oval
 * @property {number} cx
 * @property {number} cy
 * @property {number} rx
 * @property {number} ry
 * @typedef {object} FaceDesign
 * @property {Stroke} brow
 * @property {Stroke} lid  the heavy upper lid
 * @property {Stroke|null} hook  its outer end turned down
 * @property {Oval} white
 * @property {Oval & {band: number}} iris  `band`: the row its darker bottom starts at
 * @property {Oval} pupil
 * @property {Stroke|null} lash  the thin brown line along the white's bottom
 * @property {Stroke} mouth
 * @property {(Oval & {hatch: number[][][], hatchW: number})|null} blush
 */

/** His smooth neutral face, measured off the glb's sheet (its top-left cell). */
/** @type {FaceDesign} */
export const NEUTRAL = {
  brow: { pts: [...curve([105, 287], [170, 282], [210, 281], 6), [297, 281.5]], w: 9.5 },
  lid: {
    pts: [
      [90, 316],
      [120, 312],
      [150, 308],
      [250, 308],
      [290, 310],
      [318, 314],
      [330, 317],
    ],
    w: 15,
  },
  hook: {
    pts: [
      [318, 315],
      [338, 322.5],
      [348, 325],
    ],
    w: 14,
  },
  white: { cx: 204, cy: 341, rx: 115, ry: 48.5 },
  iris: { cx: 199, cy: 336, rx: 74, ry: 44, band: 357 },
  pupil: { cx: 199, cy: 331, rx: 36, ry: 22 },
  lash: { pts: curve([160, 380], [203, 391], [247, 380]), w: 3 },
  mouth: {
    pts: [
      [-4, 451.5],
      [33, 462],
    ],
    w: 5,
  },
  blush: null,
};

/**
 * The four new faces. Sad: the brows tilted up toward the middle (low enough to show under his
 * fringe, which hides his neutral brows), the lid drooping well down toward his ear (its hook
 * following it down), the eyes a little lower, the mouth turned down. Angry: the brows
 * down and in, heavier; the lid lower toward the middle and the white's bottom raised (narrowed
 * eyes: no lash, the iris is over it), a smaller pupil; a tight mouth, flat with its ends turned down. Shy: the brows raised a
 * little toward the middle, a softer lid, the eyes looking down (no lash: the iris is over it), a
 * strong blush with three hatch lines, a small wavy mouth. Smug: half-lidded (the lid flat over
 * the top of the pupil), the brows a relaxed arch, a cat's ω of a mouth (the face mirrors, so the
 * smirk is on both sides: its middle a point, its ends turned up).
 * @type {Record<'sad'|'angry'|'shy'|'smug', FaceDesign>}
 */
export const EXTRA = {
  sad: {
    brow: { pts: curve([105, 279], [200, 287], [295, 298], 8), w: 9 },
    lid: {
      pts: [
        [90, 318],
        [120, 314],
        [150, 313],
        [200, 314.5],
        [250, 320],
        [290, 329],
        [318, 338],
        [334, 345],
      ],
      w: 15,
    },
    hook: {
      pts: [
        [324, 341],
        [344, 357],
      ],
      w: 12,
    },
    white: NEUTRAL.white,
    iris: { ...NEUTRAL.iris, cy: 344, band: 365 },
    pupil: { ...NEUTRAL.pupil, cy: 339 },
    lash: NEUTRAL.lash,
    mouth: { pts: [[-6, 453], ...curve([0, 453], [20, 453], [40, 468], 8)], w: 5 },
    blush: null,
  },
  angry: {
    brow: { pts: curve([98, 308], [200, 292], [294, 278], 8), w: 11 },
    lid: {
      pts: [
        [90, 333],
        [120, 327],
        [150, 322],
        [200, 318],
        [250, 316],
        [290, 315],
        [318, 317],
        [330, 319],
      ],
      w: 15,
    },
    hook: {
      pts: [
        [322, 318],
        [347, 327],
      ],
      w: 11,
    },
    white: { cx: 204, cy: 336, rx: 115, ry: 40 },
    iris: NEUTRAL.iris,
    pupil: { cx: 199, cy: 333, rx: 30, ry: 19 },
    lash: null,
    mouth: {
      pts: [[-6, 457], [20, 457], ...curve([20, 457], [30, 457], [34, 466], 6).slice(1)],
      w: 6,
    },
    blush: null,
  },
  shy: {
    brow: { pts: curve([105, 273], [200, 278], [297, 284], 8), w: 9 },
    lid: {
      pts: [
        [90, 318],
        [120, 314],
        [150, 312],
        [250, 312],
        [290, 314],
        [318, 317.5],
        [330, 320],
      ],
      w: 14,
    },
    hook: {
      pts: [
        [322, 319],
        [342, 326],
      ],
      w: 10,
    },
    white: NEUTRAL.white,
    iris: { ...NEUTRAL.iris, cy: 352, band: 373 },
    pupil: { ...NEUTRAL.pupil, cy: 347 },
    lash: null,
    mouth: {
      pts: Array.from({ length: 18 }, (_, i) => {
        const x = -2 + i * 2;
        return [x, 459.5 + 4.5 * Math.cos((2 * Math.PI * x) / 22)];
      }),
      w: 4.5,
    },
    blush: {
      cx: 282,
      cy: 430,
      rx: 60,
      ry: 15,
      hatch: [
        [
          [250, 441],
          [261, 420],
        ],
        [
          [276, 441],
          [287, 420],
        ],
        [
          [302, 441],
          [313, 420],
        ],
      ],
      hatchW: 4,
    },
  },
  smug: {
    brow: { pts: curve([105, 290], [195, 276], [297, 281], 8), w: 9 },
    lid: {
      pts: [
        [90, 327],
        [120, 324.5],
        [150, 323],
        [250, 323],
        [290, 324],
        [318, 326.5],
        [330, 329],
      ],
      w: 14,
    },
    hook: {
      pts: [
        [322, 328],
        [348, 336],
      ],
      w: 11,
    },
    white: NEUTRAL.white,
    iris: NEUTRAL.iris,
    pupil: NEUTRAL.pupil,
    lash: NEUTRAL.lash,
    mouth: { pts: curve([0, 450], [15, 476], [31, 449], 10), w: 5 },
    blush: null,
  },
};

/**
 * The shy blush's colours: the happy blush made stronger, and its hatch lines darker (both still a
 * blush to the eye: red well over green).
 */
export const SHY_BLUSH = { fill: [240, 140, 124], hatch: [222, 104, 96] };
