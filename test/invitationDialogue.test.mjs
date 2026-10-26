// The intro dialogue's runner in the invitation toy (src/invitation/dialogue.js), on its own
// clock: a script made safe (types.js DialogueScript: unknown faces, clips and shots fall back,
// missing or doubled ids get their own, a start that isn't there is the first box, choices
// capped at three, text at 240 characters, nothing to show is null), the line typed out by
// characters a second (a beat after punctuation; reduced motion: all at once), a tap finishing
// the typing and then going on (the next id, the following box, the end), choices shown once
// the line is typed and leading where they say, Auto going on after the box's wait or one from
// the line's length, Next to the next box with choices or the end, the log of lines shown (plain
// text) and replies picked, text effects' tags counted by the letters that show, a pause
// holding the clock, and a broken script ending gracefully. Play Intro's script is content.js
// introScript() (content.json's intro, or one mended), which the runner plays as it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIALOGUE_CLIPS, FACE_NAMES } from '../src/invitation/clips.js';
import {
  DIALOGUE,
  SHOT_NAMES,
  autoDelay,
  charsAt,
  createDialogue,
  lookSway,
  normalizeScript,
  typeDuration,
} from '../src/invitation/dialogue.js';

/** A small script: a greeting, a line, a choice of two (one to a missing box), the replies, the end. */
const SCRIPT = {
  speaker: 'NEWT',
  start: 'hi',
  boxes: [
    { id: 'hi', text: 'Hi there', face: 'happy', animation: 'Wave', camera: 'medium' },
    { id: 'me', text: 'I am NEWT', face: 'neutral', animation: 'Talk', camera: 'close', next: 'ask' },
    { id: 'skipped', text: 'never reached', face: 'sad', animation: 'none', camera: 'keep' },
    {
      id: 'ask',
      text: 'Ready?',
      face: 'smug',
      animation: 'Think',
      camera: 'wide',
      choices: [
        { label: 'Yes', next: 'yes' },
        { label: 'Lost', next: 'nowhere' },
      ],
    },
    { id: 'yes', speaker: 'Narrator', text: 'Great', face: 'happy', animation: 'Cheer', camera: 'medium', end: true },
    { id: 'after', text: 'not after the end', face: 'neutral', animation: 'none', camera: 'keep' },
  ],
};

const run = (script = SCRIPT, o = {}) => {
  const d = createDialogue(/** @type {any} */ (normalizeScript(script)), o);
  d.start(0);
  return d;
};
/** Steps the runner from `from` to `to` in frames of 1/60 s; the last view. */
function stepTo(d, from, to) {
  let v = d.view;
  for (let t = from; t <= to + 1e-6; t += 1 / 60) v = d.step(t);
  return v;
}

test('a script is made safe: unknown values fall back, ids are unique, the start exists, choices and text are capped', () => {
  const s = normalizeScript({
    speaker: '',
    start: 'missing',
    boxes: [
      { id: 'a', text: 'x'.repeat(400), face: 'grumpy', animation: 'Moonwalk', camera: 'drone', auto: -3 },
      { id: 'a', text: 'doubled', face: 'shy', animation: 'Nod', camera: 'close', auto: 2 },
      { text: 'no id', face: 'angry', animation: 'none', camera: 'wide' },
      'not a box',
      {
        id: 'c',
        text: 12,
        choices: [
          { label: 'one', next: 'a' },
          { label: '', next: 'a' },
          { label: 'two', next: 'a' },
          { label: 'three', next: 'a' },
          { label: 'four', next: 'a' },
          'nope',
        ],
      },
      { id: 'd', text: 'none left', choices: [{ label: '' }] },
    ],
  });
  assert.ok(s);
  assert.equal(s.speaker, 'NEWT', 'an empty speaker is NEWT');
  assert.equal(s.start, 'a', 'a start that isn’t there is the first box');
  const ids = s.boxes.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'every id unique');
  assert.equal(s.boxes.length, 5, 'a box that isn’t an object is dropped');
  const [a, a2, noId, c, d] = s.boxes;
  assert.equal(Array.from(a.text).length, DIALOGUE.maxText, 'text capped');
  assert.equal(a.face, 'neutral');
  assert.equal(a.animation, 'none');
  assert.equal(a.camera, 'keep');
  assert.equal(a.auto, undefined, 'a negative wait is no wait of its own');
  assert.notEqual(a2.id, 'a', 'a doubled id gets its own');
  assert.equal(a2.face, 'shy');
  assert.equal(a2.animation, 'Nod');
  assert.equal(a2.auto, 2);
  assert.ok(noId.id, 'a box with no id gets one');
  assert.equal(c.text, '', 'text that isn’t a string is empty');
  assert.deepEqual(
    c.choices?.map((ch) => ch.label),
    ['one', 'two', 'three'],
  );
  assert.equal(d.choices, undefined, 'no usable choice: none');
  for (const b of s.boxes) {
    assert.ok(FACE_NAMES.includes(b.face));
    assert.ok(b.animation === 'none' || DIALOGUE_CLIPS.includes(b.animation));
    assert.ok(SHOT_NAMES.includes(b.camera));
  }
});

test('nothing to show is null: no script, no boxes', () => {
  assert.equal(normalizeScript(null), null);
  assert.equal(normalizeScript('intro'), null);
  assert.equal(normalizeScript({ boxes: [] }), null);
  assert.equal(normalizeScript({ boxes: 'many' }), null);
});

test('a line types out at DIALOGUE.cps, with a beat after punctuation; reduced motion shows it at once', () => {
  const text = 'abcdefghij';
  assert.equal(charsAt(text, 0), 0);
  assert.equal(charsAt(text, 5 / DIALOGUE.cps + 1e-6), 5);
  assert.equal(charsAt(text, 99), 10);
  assert.ok(Math.abs(typeDuration(text) - 10 / DIALOGUE.cps) < 1e-6);
  // (A comma holds the next letter back.)
  const comma = 'ab, cd';
  assert.ok(typeDuration(comma) > 6 / DIALOGUE.cps + 0.05, 'a beat after the comma');
  assert.equal(charsAt(comma, 3 / DIALOGUE.cps + 0.01), 3, 'the comma shows on time');
  assert.equal(charsAt(comma, 4 / DIALOGUE.cps + 0.01), 3, 'the space after it waits');
  // (Characters, not UTF-16 units.)
  assert.equal(charsAt('a😀b', 99), 3);

  const d = run();
  let v = d.step(0.1);
  assert.equal(v.box?.id, 'hi');
  assert.ok(v.shown > 0 && v.shown < v.length && !v.typed, 'typing');
  v = d.step(5);
  assert.ok(v.typed && v.shown === v.length, 'typed');

  const r = run(SCRIPT, { reduced: true });
  v = r.step(0);
  assert.ok(v.typed && v.shown === v.length, 'all at once');
});

test('a tap finishes the typing first, then goes on: the following box, the next id, a choice holds, the end', () => {
  const d = run();
  d.step(0.05);
  assert.equal(d.advance(0.05), 'typed');
  assert.equal(d.view.shown, d.view.length);
  assert.equal(d.view.box?.id, 'hi');
  assert.equal(d.advance(0.1), 'next');
  assert.equal(d.view.box?.id, 'me', 'the following box');
  assert.equal(d.view.shown, 0, 'typed from the start');
  const seq = d.view.seq;
  d.advance(0.2);
  d.advance(0.3);
  assert.equal(d.view.box?.id, 'ask', 'its next id, past the box between');
  assert.ok(d.view.seq > seq);
  assert.equal(d.view.choices, null, 'choices wait for the line');
  d.advance(0.4);
  assert.equal(d.view.choices?.length, 2, 'typed: the choices show');
  assert.equal(d.advance(0.5), 'wait', 'a tap never passes a choice');
  assert.equal(d.view.box?.id, 'ask');
  d.choose(0, 0.6);
  assert.equal(d.view.box?.id, 'yes');
  assert.equal(d.view.speaker, 'Narrator', 'its own speaker');
  d.advance(0.7);
  assert.equal(d.advance(0.8), 'end', 'an end box ends it');
  assert.ok(d.view.done);
  assert.equal(d.view.box, null);
});

test('the last box ends it, and so does a next that isn’t there', () => {
  const d = run({ speaker: 'NEWT', start: 'a', boxes: [{ id: 'a', text: 'one', next: 'gone' }] });
  d.advance(0);
  assert.equal(d.advance(0), 'end', 'a bad next ends it gracefully');
  const e = run({ speaker: 'NEWT', start: 'a', boxes: [{ id: 'a', text: 'one' }] });
  e.advance(0);
  e.advance(0);
  assert.ok(e.view.done, 'the last box ends it');
});

test('a choice leads where it says; one to a box that isn’t there ends it', () => {
  const d = run();
  d.skip(0);
  assert.equal(d.view.box?.id, 'ask');
  assert.equal(d.choose(5, 0), false, 'no such choice');
  assert.equal(d.choose(1, 0), true);
  assert.ok(d.view.done, 'a lost target ends it');
});

test('Auto goes on after the box’s own wait, or one from the line’s length, once typed; it waits at a choice', () => {
  assert.ok(autoDelay({ text: 'x'.repeat(120) }) > autoDelay({ text: 'hi' }), 'a longer line waits longer');
  assert.equal(autoDelay({ text: 'hi', auto: 3 }), 3, 'the box’s own wait');
  assert.ok(autoDelay({ text: '' }) >= DIALOGUE.autoMin);
  assert.ok(autoDelay({ text: 'x'.repeat(240) }) <= DIALOGUE.autoMax);

  const d = run();
  d.setAuto(true, 0);
  const typed = typeDuration('Hi there');
  const wait = autoDelay({ text: 'Hi there' });
  let v = stepTo(d, 0, typed + wait - 0.1);
  assert.equal(v.box?.id, 'hi', 'not before its wait');
  v = stepTo(d, typed + wait - 0.1 + 1 / 60, typed + wait + 0.05);
  assert.equal(v.box?.id, 'me', 'on after it');
  v = stepTo(d, typed + wait + 0.1, 40);
  assert.equal(v.box?.id, 'ask', 'on to the choice');
  assert.ok(v.choices, 'and there it waits');
  d.setAuto(false, 40);
  assert.equal(d.view.auto, false);
});

test('Skip goes to the next box with choices, typed, or to the end', () => {
  const d = run();
  d.step(0.05);
  d.skip(0.05);
  assert.equal(d.view.box?.id, 'ask');
  assert.ok(d.view.typed && d.view.choices, 'the choice, ready');
  d.choose(0, 0.1);
  d.skip(0.1);
  assert.ok(d.view.done, 'no choice ahead: the end');
  // (At a choice still typing, Skip finishes the line.)
  const e = run({ ...SCRIPT, start: 'ask' });
  e.step(0.01);
  e.skip(0.01);
  assert.equal(e.view.box?.id, 'ask');
  assert.ok(e.view.choices);
  // (A loop with no choice in it ends rather than going round for ever.)
  const loop = run({
    speaker: 'NEWT',
    start: 'a',
    boxes: [
      { id: 'a', text: 'a', next: 'b' },
      { id: 'b', text: 'b', next: 'a' },
    ],
  });
  loop.skip(0);
  assert.ok(loop.view.done);
});

test('the log lists the lines shown and the replies picked, in order; skipped lines aren’t in it', () => {
  const d = run();
  d.advance(0);
  d.advance(0);
  d.skip(0);
  d.choose(0, 0);
  assert.deepEqual(
    d.log.map((e) => [e.kind, e.speaker ?? null, e.text]),
    [
      ['line', 'NEWT', 'Hi there'],
      ['line', 'NEWT', 'I am NEWT'],
      ['line', 'NEWT', 'Ready?'],
      ['reply', null, 'Yes'],
      ['line', 'Narrator', 'Great'],
    ],
  );
});

test('paused, the clock holds: no typing, no Auto; it carries on where it was', () => {
  const d = run();
  d.setAuto(true, 0);
  d.step(0.1);
  const shown = d.view.shown;
  d.pause(true, 0.1);
  let v = stepTo(d, 0.1, 30);
  assert.equal(v.box?.id, 'hi', 'no Auto while paused');
  assert.equal(v.shown, shown, 'no typing either');
  d.pause(false, 30);
  v = d.step(30 + 1 / 60);
  assert.equal(v.box?.id, 'hi', 'carries on from where it was, not 30 s on');
  assert.ok(v.shown >= shown);
});

test('end() ends it at once; a script with nothing to show ends at the start', () => {
  const d = run();
  d.end();
  assert.ok(d.view.done);
  const empty = createDialogue(null);
  empty.start(0);
  assert.ok(empty.view.done);
  assert.equal(empty.advance(0), 'end');
});

test('the look’s sway while he talks is small and moves', () => {
  const a = lookSway(0);
  const b = lookSway(1.3);
  for (const s of [a, b, lookSway(7.7)]) {
    assert.ok(Math.abs(s.yaw) <= 0.08 && Math.abs(s.pitch) <= 0.06, JSON.stringify(s));
  }
  assert.ok(a.yaw !== b.yaw || a.pitch !== b.pitch);
});

test('Play Intro’s script is content.js introScript(): the runner plays it as it is, content.json’s intro or one mended', async () => {
  const { FALLBACK_INTRO, introFrom, introScript } = await loadContent();
  const own = introScript();
  assert.ok(own.boxes.length > 0);
  assert.deepEqual(normalizeScript(own), own, 'content.json’s intro: nothing for the runner to change');
  assert.deepEqual(normalizeScript(FALLBACK_INTRO), FALLBACK_INTRO, 'the toy’s own short intro');
  const d = createDialogue(normalizeScript(own));
  d.start(0);
  assert.equal(d.view.box?.id, own.start, 'from its start box');
  // (Broken intros as introFrom mends them: the runner agrees with every repair.)
  const broken = [
    undefined,
    'x',
    { boxes: [] },
    {
      speaker: '  ',
      start: 'gone',
      boxes: [
        { id: 'a', text: '  Hi.  ', face: 'grumpy', animation: 'Dance', camera: 'far', next: 'nowhere', auto: -2 },
        { id: 'a', text: 'Doubled.' },
        {
          id: 'b',
          text: 'Pick.',
          end: true,
          choices: [
            { label: 'Back', next: 'a' },
            { label: '', next: 'a' },
            { label: 'Lost', next: 'gone' },
          ],
        },
        { id: 'c', text: 'Last.', speaker: ' Who ', auto: 3, face: 'smug', animation: 'Cheer', camera: 'close' },
      ],
    },
  ];
  for (const raw of broken) {
    const s = introFrom(raw);
    assert.deepEqual(normalizeScript(s), s, JSON.stringify(raw));
  }
});

/** content.js, reading content.json's `invitation` as `virtual:invitation-content` (vite.config.js). */
async function loadContent() {
  const { register } = await import('node:module');
  const inv = JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8')).invitation ?? {};
  const sub = `export default ${JSON.stringify(inv)}`;
  const hooks = `export async function resolve(spec, ctx, next) {
    if (spec === 'virtual:invitation-content')
      return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(sub)}), shortCircuit: true };
    return next(spec, ctx);
  }`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
  return import('../src/invitation/content.js');
}

test('the chat screen’s markup: Title Case labels, a live region for the line, dialogs for the Log and the question, no tooltips; the Log escapes what it lists', async () => {
  const { TALK_TEXT, logHtml, talkHtml } = await import('../src/invitation/dialogueUi.js');
  const { titleCase } = await import('../src/text.js');
  for (const k of ['layer', 'auto', 'next', 'log', 'logTitle', 'close', 'you', 'replies', 'ask', 'yes', 'no'])
    assert.equal(TALK_TEXT[k], titleCase(TALK_TEXT[k]), k);
  for (const k of ['askHint', 'goOn']) assert.ok(/^[A-Z].*\.$/.test(TALK_TEXT[k]) && TALK_TEXT[k].length <= 160, k);
  const markup = talkHtml();
  assert.ok(!/\stitle=/.test(markup), 'no title= tooltips');
  assert.match(markup, /class="inv-talk-live" role="status" aria-live="polite"/);
  assert.match(markup, /class="inv-talk-text" aria-hidden="true"/, 'the typing hidden from a screen reader');
  assert.match(markup, /class="inv-talk-log" role="dialog" aria-modal="true"/);
  assert.match(markup, /class="inv-talk-ask" role="alertdialog" aria-modal="true"/);
  for (const b of ['auto', 'skip', 'log']) assert.match(markup, new RegExp(`data-talk="${b}"`));
  assert.match(markup, /data-talk="auto" aria-pressed="false"/);
  // (The top right's Next jumps to the next question or the end; Skip Intro, top left, ends it.)
  assert.equal(TALK_TEXT.next, 'Next');
  assert.match(markup, />Next<\/button>/);
  assert.ok(!/>Skip<\/button>/.test(markup), 'no Skip button any more');
  assert.match(markup, /data-intro-skip>Skip Intro<\/button>/);
  const log = logHtml([
    { kind: 'line', speaker: 'NEWT', text: 'a <b> & c' },
    { kind: 'reply', text: 'Yes' },
  ]);
  assert.match(log, /a &lt;b&gt; &amp; c/);
  assert.match(log, /class="inv-talk-log-reply"><span class="inv-talk-log-who">You<\/span> Yes/);
  assert.equal((log.match(/<li/g) ?? []).length, 2);
});

test('tags in the names and the replies: kept for the screen to draw; the log has them plain, and styled to show', () => {
  const d = run({
    speaker: '{red,wave|NEWT}',
    start: 'ask',
    boxes: [
      {
        id: 'ask',
        text: 'Ready?',
        face: 'smug',
        animation: 'Think',
        camera: 'wide',
        choices: [
          { label: '{gold,italic|Yes}!', next: 'b' },
          { label: '{red| }', next: 'b' },
          { label: 'No', next: 'b' },
        ],
      },
      { id: 'b', speaker: '{#3a7bd5|Narrator}', text: 'Great', face: 'happy', animation: 'Cheer', camera: 'medium' },
    ],
  });
  d.advance(0);
  const v = d.view;
  assert.equal(v.speaker, '{red,wave|NEWT}', 'the name tab draws its tags');
  assert.deepEqual(
    v.choices?.map((c) => c.label),
    ['{gold,italic|Yes}!', 'No'],
    'a reply that shows nothing is dropped; the rest keep their tags',
  );
  d.choose(0, 0);
  assert.equal(d.view.speaker, '{#3a7bd5|Narrator}');
  assert.deepEqual(d.log, [
    { kind: 'line', speaker: 'NEWT', styled: '{red,wave|NEWT}', text: 'Ready?' },
    { kind: 'reply', text: 'Yes!', styled: '{gold,italic|Yes}!' },
    { kind: 'line', speaker: 'Narrator', styled: '{#3a7bd5|Narrator}', text: 'Great' },
  ]);
});

test('the Log draws the names and replies styled (for the eye) and reads them plain (for a screen reader)', async () => {
  const { logHtml } = await import('../src/invitation/dialogueUi.js');
  const log = logHtml([
    { kind: 'line', speaker: 'NEWT <3', styled: '{red|NEWT} <3', text: 'hi' },
    { kind: 'reply', text: 'Yes & no', styled: '{gold,italic|Yes} & no' },
    { kind: 'line', speaker: 'Plain', styled: 'Plain', text: 'as ever' },
  ]);
  // (A styled one: a holder the screen fills with its letters, hidden from a screen reader, beside its plain text.)
  assert.match(
    log,
    /<span class="inv-talk-styled" aria-hidden="true" data-styled="\{red\|NEWT\} &lt;3"><\/span><span class="inv-talk-sr">NEWT &lt;3<\/span>/,
  );
  assert.match(
    log,
    /data-styled="\{gold,italic\|Yes\} &amp; no"><\/span><span class="inv-talk-sr">Yes &amp; no<\/span>/,
  );
  // (One with no tags, as ever: its text.)
  assert.match(log, /<span class="inv-talk-log-who">Plain<\/span> as ever/);
  assert.ok(!/data-styled="[^"]*"[^>]*>[^<]*\{/.test(log), 'no tag ever shows as text');
});

test('text effects: typing, Auto’s wait and the cap count the letters that show; the log keeps plain text', () => {
  const styled = 'I’m {red,wave|NEWT}!';
  const plain = 'I’m NEWT!';
  assert.equal(charsAt(styled, 99), plain.length);
  assert.ok(Math.abs(typeDuration(styled) - typeDuration(plain)) < 1e-6, 'typed as long as its plain text');
  for (const t of [0.05, 0.12, 0.2]) assert.equal(charsAt(styled, t), charsAt(plain, t), `at ${t} s`);
  assert.equal(autoDelay({ text: styled }), autoDelay({ text: plain }));
  // (An emoji is one letter.)
  assert.equal(charsAt('{big|👋🏽} hi', 99), 4);
  const long = `{gold|${'a'.repeat(300)}}`;
  const s = /** @type {any} */ (
    normalizeScript({ boxes: [{ id: 'a', text: long, face: 'happy', animation: 'Talk', camera: 'close' }] })
  );
  assert.equal(charsAt(s.boxes[0].text, 999), DIALOGUE.maxText, 'capped at 240 letters, its tags kept');
  assert.match(s.boxes[0].text, /^\{gold\|a+\}$/);
  const d = createDialogue(
    /** @type {any} */ (
      normalizeScript({ boxes: [{ id: 'a', text: styled, face: 'happy', animation: 'Talk', camera: 'close' }] })
    ),
  );
  d.start(0);
  let v = d.step(0.02);
  assert.equal(v.length, plain.length, 'its length in letters');
  v = d.step(5);
  assert.ok(v.typed && v.shown === plain.length);
  assert.equal(v.box?.text, styled, 'the box keeps its tags (the screen draws them)');
  assert.deepEqual(
    d.log.map((e) => e.text),
    [plain],
    'the Log lists it plain',
  );
});

test('the chat screen’s feedback, in the toolbar’s style: dither tiles, a dithered fade, stepped moves', async () => {
  const { TALK_DITHER, talkTile, talkHtml } = await import('../src/invitation/dialogueUi.js');
  // (A tile is the toolbar's Bayer 4×4 drawn at two CSS px a cell: 8×8, its cells inside the next coverage's.)
  for (const n of [...TALK_DITHER.ink, ...TALK_DITHER.fade]) {
    const t = talkTile(n);
    assert.equal(t.length, 64, `${n}: 8×8`);
    assert.equal(t.filter(Boolean).length, n * 4, `${n}/16 of it`);
    for (let y = 0; y < 8; y += 2)
      for (let x = 0; x < 8; x += 2) {
        const c = t[y * 8 + x];
        assert.ok(
          [t[y * 8 + x + 1], t[(y + 1) * 8 + x], t[(y + 1) * 8 + x + 1]].every((v) => v === c),
          'a 2 px cell',
        );
      }
  }
  const more = talkTile(8);
  assert.ok(
    talkTile(4).every((on, i) => !on || more[i]),
    'a lighter tile’s cells are in the heavier one',
  );
  // (The fade goes up from nothing, in even steps, short of whole: the last step is no mask at all.)
  assert.equal(TALK_DITHER.fade[0], 0);
  assert.ok(TALK_DITHER.fade.every((n, i) => i === 0 || n > TALK_DITHER.fade[i - 1]) && TALK_DITHER.fade.at(-1) < 16);
  assert.ok(TALK_DITHER.fadeMs >= 120 && TALK_DITHER.fadeMs <= 260, 'a short fade');
  const markup = talkHtml();
  assert.match(markup, /class="inv-talk-flash" aria-hidden="true"/);
  assert.match(markup, /class="inv-talk-ghost" aria-hidden="true"/);

  const css = readFileSync(new URL('../src/invitation/dialogue.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at >= 0, `a rule for ${sel}`);
    return css.slice(at, css.indexOf('}', at));
  };
  // (Hover a light ink dither, press a heavier one, on every button in the layer, as on the toolbar.)
  assert.match(rule('.inv-talk .inv-btn:hover:not(:disabled)'), /background-image: var\(--talk-ink-2\)/);
  assert.match(rule('.inv-talk .inv-btn:active:not(:disabled)'), /background-image: var\(--talk-ink-6\)/);
  assert.match(rule('.inv-talk .inv-btn'), /background-size: 8px 8px/);
  // (The layer dithers in: its mask through the fade's steps, a step at a time.)
  const fade = /@keyframes inv-talk-dither-in \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const steps = [...fade.matchAll(/mask-image: var\(--talk-mask-(\d+)\)/g)].map((m) => Number(m[1]));
  assert.deepEqual(steps, TALK_DITHER.fade);
  assert.match(fade, /100% \{\s*mask-image: none;/);
  assert.match(rule('.inv-talk:not([hidden])'), /animation: inv-talk-dither-in/);
  // (The replies dither in one after another.)
  assert.match(rule('.inv-talk-choices:not(.is-waiting) .inv-talk-choice'), /animation: inv-talk-dither-in/);
  const delays = [2, 3].map((n) =>
    Number(
      /animation-delay: ([\d.]+)s/.exec(
        rule(`.inv-talk-choices:not(.is-waiting) .inv-talk-choice:nth-child(${n})`),
      )?.[1],
    ),
  );
  assert.ok(delays[0] > 0 && delays[1] > delays[0], `staggered: ${delays}`);
  // (The ▼ steps, a pixel sprite's bob.)
  assert.match(rule('.inv-talk-next'), /animation: inv-talk-bob [\d.]+s steps\(/);
  // (Reduced motion: quick plain fades instead.)
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /animation: inv-talk-fade 0\.1\d?s/);
});

test('a long line scrolls in the box: it follows the typing a row at a time, and the box keeps its size', async () => {
  const { followRow, talkHtml, FOLLOW_JUMP } = await import('../src/invitation/dialogueUi.js');
  const row = 25;
  const view = { rowH: row, clientHeight: 3 * row };
  // (The first three rows show as they are; the fourth brings its row into view at the bottom.)
  assert.equal(followRow({ ...view, mid: 12, scrollTop: 0 }), 0);
  assert.equal(followRow({ ...view, mid: 2 * row + 12, scrollTop: 0 }), 0);
  assert.equal(followRow({ ...view, mid: 3 * row + 12, scrollTop: 0 }), row);
  assert.equal(followRow({ ...view, mid: 5 * row + 3, scrollTop: row }), 3 * row);
  // (It only ever follows down: a row already in view leaves the scroll as it is.)
  assert.equal(followRow({ ...view, mid: 12, scrollTop: 2 * row }), 2 * row);
  assert.ok(FOLLOW_JUMP >= 4 && FOLLOW_JUMP <= 40, 'a jump (the line finished at once) leaves the view where it is');
  const markup = talkHtml();
  assert.match(markup, /class="inv-talk-more inv-talk-more-up" aria-hidden="true" hidden/);
  assert.match(markup, /class="inv-talk-more inv-talk-more-down" aria-hidden="true" hidden/);

  const css = readFileSync(new URL('../src/invitation/dialogue.css', import.meta.url), 'utf8');
  const rule = (sel, from = 0) => {
    const at = css.indexOf(`${sel} {`, from);
    assert.ok(at >= 0, `a rule for ${sel}`);
    return css.slice(at, css.indexOf('}', at));
  };
  // (Three rows' room, no more and no less, on a phone and a desktop; two on a phone held sideways.)
  const text = rule('.inv-talk-text');
  assert.match(text, /min-height: calc\(3 \* 1\.42em\)/);
  assert.match(text, /max-height: calc\(3 \* 1\.42em\)/);
  assert.match(text, /overflow-y: hidden/);
  const side = rule('.inv-talk-text', css.indexOf('@media (orientation: landscape)'));
  assert.match(side, /min-height: calc\(2 \* 1\.42em\)/);
  assert.match(side, /max-height: calc\(2 \* 1\.42em\)/);
  // (Once it's all typed: the wheel, a finger and the keys scroll it, its scrollbar unseen.)
  const free = rule('.inv-talk-text.can-scroll');
  assert.match(free, /overflow-y: auto/);
  assert.match(free, /touch-action: pan-y/);
  assert.match(free, /overscroll-behavior: contain/);
  assert.match(text, /scrollbar-width: none/);
});

test('a dark dither rises from the bottom behind the box: sized to it, fading out over it, never a gradient', async () => {
  const { talkRise, talkHtml, TALK_DITHER } = await import('../src/invitation/dialogueUi.js');
  // (From the screen's bottom to the box's top, in whole 8 px tiles, never short of it.)
  assert.equal(talkRise(844, 844 - 160), 160);
  assert.equal(talkRise(844, 844 - 161), 168);
  assert.equal(talkRise(800, 800 - 199.5), 200);
  assert.equal(talkRise(500, 600), 0, 'a box off the bottom: none');
  const markup = talkHtml();
  const dim = /<div class="inv-talk-dim" aria-hidden="true">([\s\S]*?)<\/div>/.exec(markup)?.[1] ?? '';
  const bands = [...dim.matchAll(/class="inv-talk-dim-(\d+)"/g)].map((m) => Number(m[1]));
  // (Lightest at the top, densest behind the box; every coverage one of the ink's tiles.)
  assert.ok(bands.length >= 4, `bands: ${bands}`);
  assert.ok(
    bands.every((n, i) => i === 0 || n > bands[i - 1]),
    'denser further down',
  );
  for (const n of bands) assert.ok(TALK_DITHER.ink.includes(n), `${n}: an ink tile`);

  const css = readFileSync(new URL('../src/invitation/dialogue.css', import.meta.url), 'utf8');
  const at = css.indexOf('.inv-talk-dim {');
  const rule = css.slice(at, css.indexOf('}', at));
  assert.match(rule, /height: calc\(var\(--talk-rise, \d+px\) \+ var\(--talk-fade\)\)/);
  assert.ok(!/gradient/.test(rule), 'dithered, not a smooth gradient');
  for (const n of bands)
    assert.match(
      css,
      new RegExp(String.raw`\.inv-talk-dim-${n} \{[^}]*background-image: var\(--talk-ink-${n}\)`),
      `band ${n}`,
    );
});
