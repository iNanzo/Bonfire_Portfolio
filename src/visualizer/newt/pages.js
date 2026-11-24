// S1 reference paper colors (docs/design/captures/newt-live-s1/s1.js).
// Fixed paper palettes; no renderer or toy content dependency.
export const NEWT_TONES = [0x1f1f1f, 0x393839, 0x656360, 0x928e89, 0xe1b895, 0xbebebc, 0xaaa5a0, 0x77736e];
const rgb = (hex) => [hex >> 16, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
const entry = (name, color, ink, light) => {
  const c = rgb(color);
  // Keep each cluster in its slot through page turns. This dark replacement stays
  // distinct from the exposed, dithered Dusk paper without swallowing his trousers.
  const tones = NEWT_TONES.slice(0, 6).map((hex) =>
    Math.hypot(...rgb(hex).map((v, i) => v - c[i])) > 0.08 ? hex : 0x333231,
  );
  return {
    name,
    color,
    ink,
    light,
    shadow: 0x000000,
    tones,
    palette: [ink, color, 0xf1d786, 0xe4b85d, 0xd3983d, 0x5a0a12, 0x96151f, 0xd24b52, 0xe44544, 0x851d1b, ...tones],
  };
};
export const PAGES = {
  white: entry('White', 0xffffff, 0x3a332d, true),
  cream: entry('Cream', 0xfdfaf4, 0x3a332d, true),
  dusk: entry('Dusk', 0x2d3447, 0xe8dcc8, false),
  night: entry('Night', 0x14121a, 0xe8dcc8, false),
};
export const pageOf = (key) => PAGES[key] ?? PAGES.dusk;

// The page turn blends the void, ink and palette on the same clock in linear light.
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
export function blendPages(from, to, amount) {
  const a = pageOf(from),
    b = pageOf(to),
    k = Math.max(0, Math.min(1, amount));
  const color = (x, y) =>
    rgb(x)
      .map((v, i) => Math.round(srgb(linear(v) * (1 - k) + linear(rgb(y)[i]) * k) * 255))
      .reduce((hex, v) => (hex << 8) | v, 0);
  return {
    ...b,
    color: color(a.color, b.color),
    ink: color(a.ink, b.ink),
    palette: a.palette.map((v, i) => color(v, b.palette[i])),
    shadow: color(a.shadow, b.shadow),
    tones: a.tones.map((v, i) => color(v, b.tones[i])),
  };
}
