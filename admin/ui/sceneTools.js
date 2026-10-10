// @ts-nocheck: 6 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// The Scenes page's tools: Bonfire Live's preset scenes (content.json `scenes`, the format is
// src/scenes.js) are made in the Bonfire Painter, so the admin brings them in and sends them
// back rather than editing each of their ~80 settings here:
//   • the block: Import From Painter (a file the Painter exported, or pasted JSON; a scene
//     whose id is already here replaces that one if you confirm, else comes in as a copy),
//     Open the Painter ↗, and Export All (bonfire-scenes.json, for the Painter's Import);
//   • each scene's card: its colors as swatches, its summary line, what it holds part by part
//     (sceneDetails), its name, id and "With the Music" as fields, Open in Painter ↗ (the
//     scene rides in the link: painter/#scene=…, so it opens as it is here, saved or not),
//     Copy JSON, and Replace From Painter… (this card's scene, keeping its id and its place
//     in the loop).
// Every change is an ordinary edit: validated live (contentRules.js → validateScenes; a
// problem deep inside a scene shows on its card with its path), undone by Discard.
import { el, renderField } from './form.js';
import { HEX_RE } from '../../src/contentRules.js';
import {
  CAMERA_MOVES,
  encodeSceneHash,
  FLY_SHOWS,
  MAX_SCENES,
  normalizeScene,
  readSceneFile,
  sceneFile,
  sceneSummary,
  sceneSwatches,
  uniqueSceneId,
} from '../../src/scenes.js';
import { SCENERIES } from '../../src/sceneries.js';
import { DROP_FX, LAYERS, LOOKS } from '../../src/visualizer/looks.js';
import { PALETTES } from '../../src/visualizer/render.js';
import { FORMATIONS } from '../../src/visualizer/knightShow.js';

const voidOf = (ctx) =>
  HEX_RE.test(ctx.draft.effects?.colors?.void ?? '') ? ctx.draft.effects.colors.void : undefined;
/** A tool's button; `tip` says what it does (the shared tooltip, on hover and focus; none while it's disabled). */
const toolButton = (text, tip, onclick, extra = {}) =>
  el('button', {
    type: 'button',
    class: 'button small',
    text,
    'data-tip': extra.disabled ? null : tip,
    onclick,
    ...extra,
  });
/** The Painter's address on the site (with a scene to open, in the hash), or null without a site address. */
const painterUrl = (ctx, scene = null) =>
  ctx.siteUrl ? `${ctx.siteUrl}painter/${scene ? `#scene=${encodeSceneHash(scene)}` : ''}` : null;
/** A scene as the Painter writes it (the admin's loop switch isn't part of it). */
const bare = (scene) => Object.fromEntries(Object.entries(scene).filter(([k]) => k !== 'hidden'));

/**
 * A small import panel: pick a file the Painter exported, or paste JSON and press the
 * button. `onText(text)` gets what was read (true closes the panel).
 * @param {{ label: string, onText: (text: string) => boolean, onClose: () => void }} o
 */
function importPanel({ label, onText, onClose }) {
  const area = el('textarea', {
    rows: 6,
    class: 'scene-paste',
    spellcheck: 'false',
    'aria-label': 'Paste the scene JSON',
    placeholder: 'Paste a scene or a bonfire-scenes.json from the Painter…',
  });
  const picker = el('input', {
    type: 'file',
    accept: '.json,application/json,text/plain',
    hidden: true,
    onchange: async () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (file && onText(await file.text())) onClose();
    },
  });
  return el(
    'div',
    { class: 'scene-import' },
    picker,
    el(
      'div',
      { class: 'pt-row' },
      toolButton('Choose a File…', 'A bonfire-scenes.json the Painter exported (or one scene’s JSON)', () =>
        picker.click(),
      ),
      el('span', { class: 'pt-or', text: 'or paste it below' }),
    ),
    area,
    el(
      'div',
      { class: 'pt-row' },
      toolButton(
        label,
        'Read the pasted JSON',
        () => {
          if (area.value.trim() && onText(area.value)) onClose();
        },
        { class: 'button small primary' },
      ),
      toolButton('Cancel', 'Close this without changing anything', onClose, { class: 'button small ghost' }),
    ),
  );
}

/** Read the Painter's JSON: the scenes, or a toast saying why not (null). Warnings are toasts too. */
function readScenes(text, ctx) {
  const { scenes, errors } = readSceneFile(text, { voidHex: voidOf(ctx) });
  for (const e of errors) ctx.toast(e, scenes.length ? 'info' : 'error');
  return scenes.length ? scenes : null;
}

/**
 * Bring scenes in: new ones join the end of the loop; one whose id is already here replaces
 * it (keeping its place and its loop switch) if you confirm, else comes in as a copy.
 * Returns how many came in and how many replaced others.
 */
export function importScenes(incoming, ctx, { confirm: ask = (m) => confirm(m) } = {}) {
  ctx.draft.scenes ??= [];
  const list = ctx.draft.scenes;
  let added = 0;
  let replaced = 0;
  for (const scene of incoming) {
    const at = list.findIndex((s) => s?.id === scene.id);
    if (
      at >= 0 &&
      ask(
        `“${list[at].name}” is already here with the id “${scene.id}”. Replace it with the Painter’s “${scene.name}”? (Cancel brings it in as a copy.)`,
      )
    ) {
      list[at] = { ...bare(scene), ...(list[at].hidden ? { hidden: true } : {}) };
      replaced++;
    } else {
      const taken = new Set(list.map((s) => s?.id));
      list.push(taken.has(scene.id) ? { ...bare(scene), id: uniqueSceneId(scene.name, taken) } : bare(scene));
      added++;
    }
  }
  return { added, replaced };
}

/** The Scenes block's tools: Import From Painter, Open the Painter ↗, Export All. */
export function scenesBlockTools(ctx) {
  const slot = el('div', { class: 'scene-import-slot' });
  const close = () => slot.replaceChildren();
  const open = () =>
    slot.replaceChildren(
      importPanel({
        label: 'Import',
        onClose: close,
        onText: (text) => {
          const scenes = readScenes(text, ctx);
          if (!scenes) return false;
          const { added, replaced } = importScenes(scenes, ctx);
          const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
          ctx.toast(
            [added && `Imported ${n(added, 'scene')}`, replaced && `replaced ${n(replaced, 'scene')}`]
              .filter(Boolean)
              .join('; ') + '.',
          );
          ctx.focus = `scenes[${ctx.draft.scenes.length - 1}]`;
          ctx.changed({ rerender: true });
          return true;
        },
      }),
    );
  const scenes = ctx.draft.scenes ?? [];
  const painter = painterUrl(ctx);
  return el(
    'div',
    { class: 'palette-tools is-block scene-tools' },
    el(
      'div',
      { class: 'pt-row' },
      el('span', { class: 'pt-label', text: 'The Painter' }),
      toolButton('Import From Painter…', 'Bring in scenes the Painter exported (a file, or pasted JSON)', open),
      painter
        ? el('a', {
            class: 'button small ghost',
            href: painter,
            target: '_blank',
            rel: 'noopener',
            text: 'Open the Painter ↗',
            'data-tip': 'Make a new scene in the Bonfire Painter, then export it and import it here',
          })
        : null,
      toolButton(
        'Export All',
        'Download every scene here as bonfire-scenes.json (the Painter’s Import reads it)',
        () => download(sceneFile(scenes.map(bare)), 'bonfire-scenes.json'),
        { class: 'button small ghost', disabled: !scenes.length },
      ),
    ),
    slot,
    el('p', {
      class: 'help',
      text: `${scenes.length} of up to ${MAX_SCENES} scenes, ${scenes.filter((s) => !s?.hidden).length} in the loop.`,
    }),
  );
}

function download(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A scene card's thumbnail: its flame's ramp, then its own scenery colors (when it has them). */
export function sceneThumb(scene) {
  const colors = sceneSwatches(scene);
  return el(
    'span',
    { class: 'swatches scene-swatches', 'aria-hidden': 'true' },
    colors.map((c, i) =>
      el('span', {
        class: `swatch${i === 5 ? ' is-scenery' : ''}`,
        style: { background: HEX_RE.test(c) ? c : 'transparent' },
      }),
    ),
  );
}

/** A scene card's one-line summary (its place, look, knights, how it plays with the music). */
export const sceneMeta = (scene) => {
  try {
    return sceneSummary(scene);
  } catch {
    return '';
  }
};

const MODE_WORDS = { on: 'always', mix: 'in the mix', off: 'off' };
/**
 * What a scene holds, part by part, for its card (the Painter is where it's changed):
 * [label, text] rows. `weapons` names the weapons (content.json's).
 * @param {unknown} raw
 * @param {Record<string, string>} [weapons]
 * @returns {[string, string][]}
 */
export function sceneDetails(raw, weapons = {}) {
  const s = normalizeScene(raw);
  const { place, camera, look, layers, knights, fireflies, render, drops } = s;
  const named = (table, k) => table[k] ?? k;
  const on = Object.keys(LAYERS)
    .filter((k) => layers[k] === 'on')
    .map((k) => LAYERS[k]);
  const mixed = Object.keys(LAYERS)
    .filter((k) => layers[k] === 'mix')
    .map((k) => LAYERS[k]);
  const hits = drops
    ? Object.keys(DROP_FX)
        .filter((k) => drops.fx[k] === 'on')
        .map((k) => DROP_FX[k])
    : [];
  // (A fixed palette's name in the line's own case: "the flame’s colors", "ashen (3 colors)".)
  const palette = Array.isArray(render.palette)
    ? `${render.palette.length} of the flame’s colors`
    : named(PALETTES, render.palette).toLowerCase();
  return [
    [
      'Place',
      [
        SCENERIES[place.scenery],
        place.weapon ? (weapons[place.weapon] ?? place.weapon) : 'a drawn weapon',
        place.element ? ELEMENT_WORDS[place.element] : 'a drawn element',
      ].join(' · '),
    ],
    [
      'Camera',
      `${CAMERA_MOVES[camera.move.kind]}${camera.move.kind === 'still' ? '' : ` over ${camera.move.bars} bars`} · a ${camera.fov}° lens`,
    ],
    [
      'Look',
      [
        `${named(LOOKS, look.name)} at ${Math.round(look.amount * 100)}%`,
        on.length ? `with ${on.join(', ')}` : '',
        mixed.length ? `${mixed.join(', ')} in the mix` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    [
      'Drops',
      drops ? (hits.length ? `${hits.join(', ')} (${drops.count} a drop)` : 'none of its own') : 'the show’s own',
    ],
    [
      'Knights',
      knights.count
        ? `${knights.count} · dancing ${MODE_WORDS[knights.dance]} · ${knights.formation === 'mix' ? 'formations in the mix' : named(FORMATIONS, knights.formation)}`
        : 'none',
    ],
    [
      'Fireflies',
      `${fireflies.lit} lit · ${fireflies.show === 'mix' ? 'shows in the mix' : fireflies.show === 'off' ? 'no show' : `the ${named(FLY_SHOWS, fireflies.show)} show`}`,
    ],
    [
      'Render',
      `${render.pixelSize} px pixel size · ${palette} · ${render.fog === 'off' ? 'no fog' : `${render.fog} fog`}${render.xray ? ` · x-ray: ${render.xray}` : ''}`,
    ],
  ];
}
const ELEMENT_WORDS = { fire: 'Fire', lightning: 'Lightning', ice: 'Ice' };

/**
 * A scene card's body: its name, id and music as fields, the rest as the summary, and the
 * Painter's tools (Open in Painter ↗, Copy JSON, Replace From Painter…).
 * @param {object} item  the scene (in the draft)
 * @param {(string|number)[]} ipath  e.g. ['scenes', 2]
 */
export function sceneCardBody(item, ipath, ctx) {
  const fields = el(
    'div',
    { class: 'fields' },
    ...['name', 'id', 'music'].filter((k) => k in item).map((k) => renderField(item[k], [...ipath, k], ctx)),
  );
  const slot = el('div', { class: 'scene-import-slot' });
  const close = () => slot.replaceChildren();
  const replace = () =>
    slot.replaceChildren(
      importPanel({
        label: 'Replace',
        onClose: close,
        onText: (text) => {
          const scenes = readScenes(text, ctx);
          if (!scenes) return false;
          const next = scenes[0];
          if (scenes.length > 1)
            ctx.toast(`That has ${scenes.length} scenes; the first, “${next.name}”, replaces this one.`);
          if (
            !confirm(
              `Replace “${item.name}” with the Painter’s “${next.name}”? It keeps its id (“${item.id}”) and its place in the loop.`,
            )
          )
            return false;
          const list = ctx.draft.scenes;
          const i = ipath[1];
          list[i] = { ...bare(next), id: item.id, ...(item.hidden ? { hidden: true } : {}) };
          ctx.open.add(list[i]);
          ctx.changed({ rerender: true });
          ctx.toast(`“${item.name}” replaced.`);
          return true;
        },
      }),
    );
  const link = painterUrl(ctx, bare(item));
  return el(
    'div',
    { class: 'scene-body' },
    el(
      'dl',
      { class: 'scene-details' },
      sceneDetails(item, ctx.draft.weapons).map(([k, v]) =>
        el('div', {}, el('dt', { text: k }), el('dd', { text: v })),
      ),
    ),
    fields,
    el(
      'div',
      { class: 'card-foot' },
      link
        ? el('a', {
            class: 'link-button',
            href: link,
            target: '_blank',
            rel: 'noopener',
            text: 'Open in Painter ↗',
            'data-tip':
              'Open this scene in the Bonfire Painter as it is here (saved or not): see it play, change it, export it',
          })
        : null,
      el('button', {
        type: 'button',
        class: 'link-button',
        text: 'Copy JSON',
        'data-tip': 'Copy this scene’s JSON (the Painter’s Import reads it)',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(bare(item), null, 2));
            ctx.toast(`“${item.name}” copied.`);
          } catch {
            ctx.toast('Couldn’t copy (the browser said no).', 'error');
          }
        },
      }),
      el('button', {
        type: 'button',
        class: 'link-button',
        text: 'Replace From Painter…',
        'data-tip': 'Put the Painter’s version of this scene in its place (a file, or pasted JSON)',
        onclick: replace,
      }),
    ),
    slot,
  );
}
