// Fixed paper palettes; no renderer or toy content dependency.
export const NEWT_TONES = [0x1f1f1f, 0x393839, 0x656360, 0x928e89, 0xe1b895, 0xbebebc, 0xaaa5a0, 0x77736e];
const rgb = (hex) => [hex >> 16, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
const entry = (name, color, ink, light) => {
  const c = rgb(color);
  const tones = NEWT_TONES.filter((hex) => Math.hypot(...rgb(hex).map((v, i) => v - c[i])) > 0.08).slice(0, 6);
  return {
    name,
    color,
    ink,
    light,
    tones,
    palette: [ink, color, 0xf1d786, 0xe4b85d, 0xd3983d, 0x5a0a12, 0x96151f, 0xd24b52, 0xe44544, 0x851d1b, ...tones],
  };
};
export const PAGES = {
  white: entry('White', 0xffffff, 0x3a332d, true),
  cream: entry('Cream', 0xfff1d0, 0x3a332d, true),
  dusk: entry('Dusk', 0x51434f, 0xe8d9c5, false),
  night: entry('Night', 0x191b2a, 0xe8d9c5, false),
};
export const pageOf = (key) => PAGES[key] ?? PAGES.dusk;
