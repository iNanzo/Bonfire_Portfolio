// Generates tiny Bayer-dithered PNG patterns at runtime and exposes them as
// CSS custom properties, so UI fades use the same ordered dither as the 3D scene.
//
//   --dv-0 … --dv-16   4×4 tiles of void pixels at N/16 coverage (veils)
//   --dg-<color>       4×16 vertical gradient, opaque at the bottom (edges)

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function tile(w, h, color, coverage) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (BAYER4[y % 4][x % 4] < coverage(x, y) * 16) g.fillRect(x, y, 1, 1);
    }
  }
  return `url("${c.toDataURL('image/png')}")`;
}

export function installDitherPatterns(colors, root = document.documentElement) {
  for (let n = 0; n <= 16; n++) {
    root.style.setProperty(`--dv-${n}`, tile(4, 4, colors.void, () => n / 16));
  }
  for (const name of ['void', 'shadow']) {
    root.style.setProperty(`--dg-${name}`, tile(4, 16, colors[name], (x, y) => (y + 0.5) / 16));
  }
}
