// What Bonfire Live's parts share. main.js makes one `ctx` and hands it to each part it
// builds (the start screen, the HUD, the keys, the scenes, the dialogs…). The scene, its
// director and the sound come and go while the page is open (a rebuilt scene, another
// source), so a part reads them from `ctx` at the moment it needs them and never keeps a
// copy. A part that the others call adds those functions to `ctx` as it's made (main.js:
// `Object.assign(ctx, createPart(ctx))`), so a call between two parts reads `ctx.name(…)`.
// Nothing here runs: it's the list of what's in `ctx`, for the reader and the type check.

/**
 * The sound: one audio context for the page's whole life, and the source playing into it.
 * @typedef {object} LiveEngine
 * @property {AudioContext} ctx
 * @property {any} analyser  analyser.js createAnalyser: what the sound is doing, every frame
 * @property {DelayNode} delay  the analysis waits as long as the speakers do (output latency)
 * @property {GainNode} monitor  what plays through the speakers (a file, the demo)
 * @property {any} source  the source playing ({ kind, name, stop(), track?, media?, playback? }), or null
 */

/**
 * @typedef {import('./sceneLoop.js').SceneEntry} SceneEntry  a preset scene and its ref ('b:…' built in, 'm:…' mine)
 */

/**
 * @typedef {object} LiveContext
 * @property {Record<string, any>} settings  this browser's settings (settings.js), changed in place
 * @property {boolean} reducedMotion
 * @property {any} fire  the bonfire (scene.js createBonfire), once built; null until then, or if it couldn't start
 * @property {any} director  director.js: turns the sound into the show; null until the scene is built
 * @property {LiveEngine | null} engine  the sound, once a source was picked
 * @property {Record<string, any> | null} lastFeatures  what the director was last handed (analyser.js features)
 * @property {SceneEntry | null} firstScene  the preset scene the show opens on (?scene=, a chip, N on the start screen)
 * @property {string | null} solo  the ref of the scene playing on its own (the Painter's "Play in Bonfire Live"), or null
 */

export {};
