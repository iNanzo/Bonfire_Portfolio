// Bonfire Live's pack (I): the site's pack (ui/pack.js) over the show, to pick by hand where
// the fire is, the weapon in it, its flame and element, a ring or a living weapon, and the
// knights' helmets, gestures, style and finish. A place picked wins over a preset scene's.
import { createPack, bonfireItems } from '../ui/pack.js';
import { ui, weapons } from '../content.js';
import { SCENERIES } from '../sceneries.js';
import { HELMETS } from './knightShow.js';
import { STYLE_NAMES } from '../bonfire/knightStyles.js';
import { FINISH_NAMES } from '../bonfire/steel.js';

/**
 * The pack's part of the page (main.js puts the pack on the page).
 * @param {import('./context.js').LiveContext} ctx
 */
export function createPackUi(ctx) {
  const { reducedMotion } = ctx;

  const pack = createPack({
    label: ui.pack,
    items: bonfireItems({
      state: () => (ctx.fire ? {
        scenery: ctx.fire.scenery, weapon: ctx.fire.weapon, element: ctx.fire.element, flame: ctx.fire.flame,
        helmet: ctx.fire.knights?.present ? ctx.fire.knights.helmet : null,
        style: ctx.fire.knights?.present ? ctx.fire.knights.style ?? null : null,
        finish: ctx.fire.knights?.present ? ctx.fire.knights.finish ?? null : null,
      } : null),
      busy: () => !ctx.fire || ctx.fire.forging,
      reducedMotion,
      onScene: (key) => {
        ctx.director?.releaseScene(['scenery']); // (your pick wins over a scene's place)
        if (ctx.fire?.setScenery(key, { flash: true })) ctx.note(`Traveled to ${SCENERIES[key]}`, 1.5);
      },
      onWeapon: (key) => {
        if (!ctx.fire || key === ctx.fire.weapon) return;
        if (ctx.fire.forging) { ctx.note('The forge is busy', 1.5); return; }
        ctx.fire.equip(key, ctx.fire.flame, { element: ctx.fire.element }).catch(() => {});
        ctx.note(`Forging the ${weapons[key]}`, 2);
      },
      onRing: () => ctx.director?.ring(1),
      onLiving: () => ctx.actions.combo(),
      onElement: (key) => { if (!ctx.director?.hit({ element: key })) ctx.note('The forge is busy', 1.5); },
      onFlame: (key) => {
        if (!ctx.fire || key === ctx.fire.flame) return;
        if (ctx.fire.forging) { ctx.note('The forge is busy', 1.5); return; }
        ctx.fire.equip(ctx.fire.weapon, key, { element: ctx.fire.element }).catch(() => {});
      },
      // The knights (every one by the fire): a new helmet (hands to the helm), a gesture.
      onHelmet: (key) => {
        if (!ctx.fire?.knights?.present) return;
        ctx.fire.knights.setHelmet(key);
        ctx.note(`Helmet: ${HELMETS[key] ?? key}`, 1.5);
      },
      onGesture: (name) => { ctx.fire?.knights?.gesture(name, { index: 'all' }); },
      // ...their style and the color of their steel, for them all (the Knights tab's Style and
      // Finish roll them again at the hidden moments when they're in the mix).
      onStyle: (key) => {
        if (!ctx.fire?.knights?.present || !ctx.fire.knights.setStyle) return;
        Promise.resolve(ctx.fire.knights.setStyle(key)).catch(() => {});
        ctx.note(`Style: ${STYLE_NAMES[key] ?? key}`, 1.5);
      },
      onFinish: (key) => {
        if (!ctx.fire?.knights?.present || !ctx.fire.knights.setFinish) return;
        ctx.fire.knights.setFinish(key);
        ctx.note(`Finish: ${FINISH_NAMES[key] ?? key}`, 1.5);
      },
    }),
  });

  return { pack };
}
