// The weapons by kind, as the pack's Anvil lists them: swords, greatswords, polearms, then
// axes and hammers, each in the order a smith would hang them. Keys are WEAPON_KEYS
// (src/ruleBasics.js: the 3D model's nodes); the names are the content's (`weapons`, which
// the admin can rename), and each group's heading is the content's too (ui.packSwords,
// ui.packGreatswords, ui.packPolearms, ui.packAxes). A test checks every weapon is in
// exactly one group. Pure data with no imports, so the pack can list them on the site's
// first load (contentRules.js re-exports it, beside WEAPON_KEYS).

/** @type {Record<'swords' | 'greatswords' | 'polearms' | 'axes', string[]>} */
export const WEAPON_GROUPS = {
  swords: ['longsword', 'broadsword', 'bastard', 'sabre', 'rapier', 'estoc', 'katana', 'uchigatana'],
  greatswords: ['claymore', 'greatsword', 'zweihander', 'flamberge', 'flambergezwei'],
  polearms: ['spear', 'wingedspear', 'glaive', 'naginata', 'halberd', 'lance'],
  axes: ['battleaxe', 'mace', 'warhammer', 'morningstar'],
};
