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
 * What the page is doing: the settings, the scene, the sound.
 * @typedef {object} LiveState
 * @property {Record<string, any>} settings  this browser's settings (settings.js), changed in place
 * @property {boolean} reducedMotion
 * @property {any} fire  the bonfire (scene.js createBonfire), once built; null until then, or if it couldn't start
 * @property {any} director  director.js: turns the sound into the show; null until the scene is built
 * @property {LiveEngine | null} engine  the sound, once a source was picked
 * @property {ReturnType<typeof import('./tickBatch.js').createTickBatch>} heard  what the analyser heard since the last drawn frame (tickBatch.js)
 * @property {Record<string, any> | null} lastFeatures  what the director was last handed (analyser.js features)
 * @property {SceneEntry | null} firstScene  the preset scene the show opens on (?scene=, a chip, N on the start screen)
 * @property {string | null} solo  the ref of the scene playing on its own (the Painter's "Play in Bonfire Live"), or null
 */

/**
 * The preset scenes (scenesUi.js).
 * @typedef {object} ScenesPart
 * @property {any} store  sceneStore.js: this browser's scenes, and the pictures kept of the built-in ones
 * @property {() => SceneEntry[]} library  every scene, the built-in ones first (hidden ones left out)
 * @property {() => SceneEntry[]} loopLibrary  the scenes the loop plays from (Scenes From)
 * @property {(ref: string) => SceneEntry | null} findScene  a scene by its ref (a hidden built-in one too)
 * @property {(entry: SceneEntry | null, o?: { instant?: boolean, lock?: boolean }) => void} playScene  play one (null: the free show)
 * @property {(o?: { name?: string | null, ref?: string | null }) => void} sceneArrived  the director says a scene arrived
 * @property {() => void} showScene  name the scene playing everywhere it shows
 * @property {() => void} drawChips  the start screen's scene chips, again
 * @property {() => void} nextScene  N
 * @property {() => void} cycleScenes  Shift+N
 * @property {() => string | null} waitingForDrop  the scene N asked for while it waits for the drop's strike
 * @property {(ref: string) => void} keepThumb  keep a picture of a built-in scene playing live, the first time
 */

/**
 * The title cards (cards.js).
 * @typedef {object} CardsPart
 * @property {(n: number | { title: string, subtitle?: string, scene?: boolean }, o?: { ms?: number }) => void} showCard  card n (0: the main one), or a card of its own
 * @property {(when: 'drops' | 'phrases') => void} nextCard  the next card whose turn it is, if any
 */

/**
 * The sound (sources.js).
 * @typedef {object} SourcesPart
 * @property {(kind: 'input' | 'capture' | 'file' | 'demo', o?: { file?: File | null }) => Promise<void>} useSource  start a source (the last one stops)
 * @property {() => void} stopSource  the sound goes: the show as if it fell silent
 * @property {() => Promise<void>} listDevices  the start screen's list of inputs, again
 */

/**
 * The HUD (hud.js).
 * @typedef {object} HudPart
 * @property {(text: string, seconds?: number) => void} note  a passing line in the HUD, for `seconds`
 * @property {(f: Record<string, any>, dt: number) => void} drawHud  the HUD for a drawn frame (what was heard since the last)
 * @property {() => void} wake  the controls and the cursor back (they fade again when the mouse rests)
 * @property {() => Promise<void>} keepAwake  keep the screen on
 */

/**
 * What main.js still gives the parts (until each moves into one of its own).
 * @typedef {object} MainPart
 * @property {() => void} mirrorCard  copy the title card into the output window
 * @property {(text: string) => void} showError  the start screen's error line says `text`
 * @property {() => void} hideError
 * @property {(message?: string) => void} showStart  back to the start screen (saying why, if `message`)
 * @property {() => void} goLive  the music started: the HUD instead of the start screen
 * @property {(tab?: string, o?: { search?: boolean }) => void} openSettings
 * @property {(key: string | string[]) => void} applySettings  a setting (or the ones a preset changed) changed
 * @property {any} settingsPanel  settingsDialog.js bindSettings: the settings dialog
 * @property {any} keysOverlay  ui/keysOverlay.js: every shortcut (?)
 * @property {any} renderMenu  ui/renderMenu.js: Render Settings (P)
 */

/** @typedef {LiveState & ScenesPart & CardsPart & SourcesPart & HudPart & MainPart} LiveContext */

export {};
