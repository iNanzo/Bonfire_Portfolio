// Bonfire Live's Render Settings (P): the site's render menu (ui/renderMenu.js) over the
// Picture tab's switches, a digit a step (0 resets them), on the start screen too. A row a
// preset scene sets shows the scene's value, and what a switch in the mix is doing right
// now shows after it.
import { renderText, FOGS, XRAY_VIEWS, stepRender } from './render.js';
import { modeOf } from './looks.js';
import { createRenderMenu } from '../ui/renderMenu.js';
import { defaults } from './settings.js';

/**
 * The render menu's part of the page (main.js puts the menu on the page).
 * @param {import('./context.js').LiveContext} ctx
 */
export function createRenderUi(ctx) {
  const { settings } = ctx;

  // Each row steps its setting (render.js RENDER_STEPS) and the picture follows at once. What
  // a switch in the mix is doing right now shows after it.
  const RENDER_ROWS = [
    { key: '1', id: 'pixelSize', label: 'Pixel Size' },
    { key: '2', id: 'palette', label: 'Palette' },
    { key: '3', id: 'fewColors', label: 'Few Colors' },
    { key: '4', id: 'dither', label: 'Dither' },
    { key: '5', id: 'ditherMatrix', label: 'Dither Pattern' },
    { key: '6', id: 'outlines', label: 'Outlines' },
    { key: '7', id: 'fog', label: 'Fog' },
    { key: '8', id: 'xray', label: 'X-Ray Flips' },
    { key: '9', id: 'pixelShift', label: 'Pixel Size Shifts' },
  ];
  function renderValues() {
    // (What shows: a preset scene's own where it sets one, marked "· Scene".)
    const shown = ctx.director?.parts?.layers?.view ?? settings;
    const over = ctx.director?.parts?.layers?.over ?? {};
    const v = Object.fromEntries(RENDER_ROWS.map((r) => [r.id, `${renderText(shown, r.id)}${Object.hasOwn(over, r.id) ? ' · Scene' : ''}`]));
    const live = ctx.director?.render;
    if (!live) return v;
    const mix = (key) => modeOf(shown[key]) === 'mix';
    if (live.pixelSize && live.pixelSize !== shown.pixelSize) v.pixelSize += ` · ${live.pixelSize} px Now`;
    if (mix('fewColors')) v.fewColors += live.few ? ' · On Now' : ' · Off Now';
    if (mix('outlines')) v.outlines += live.outlines ? ' · On Now' : ' · Off Now';
    if (shown.ditherMatrix === 'mix') v.ditherMatrix += ` · ${live.matrix}×${live.matrix}`;
    if (shown.fog === 'mix') v.fog += ` · ${FOGS[live.fog] ?? live.fog}`;
    if (live.xray) v.xray += ` · ${XRAY_VIEWS[live.xray] ?? live.xray}`;
    return v;
  }
  const renderMenu = createRenderMenu({
    title: 'Render Settings',
    rows: RENDER_ROWS,
    className: 'debug-hud viz-render-menu',
    read: renderValues,
    pick: (id, dir) => {
      // (Stepping a row the scene sets takes it back from the scene, from its value.)
      const over = ctx.director?.parts?.layers?.over;
      if (over && Object.hasOwn(over, id)) settings[id] = over[id];
      ctx.director?.releaseScene(id === 'xray' ? [id, 'xrayView'] : [id]);
      stepRender(settings, /** @type {any} */ (id), dir);
      ctx.applyRender();
      return renderValues();
    },
    reset: {
      key: '0', label: 'Reset Render Settings', hint: 'To the Defaults',
      run: () => {
        const d = defaults();
        for (const r of RENDER_ROWS) settings[r.id] = d[r.id];
        ctx.director?.releaseScene([...RENDER_ROWS.map((r) => r.id), 'xrayView']);
        ctx.applyRender();
      },
    },
    onToggle: () => ctx.wake(),
  });

  return { renderMenu };
}
