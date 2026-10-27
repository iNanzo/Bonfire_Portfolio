// The intro dialogue's runner in the invitation toy (src/invitation/dialogue.js), on its own
// clock: a script made safe (types.js DialogueScript: unknown faces, clips and shots fall back,
// missing or doubled ids get their own, a start that isn't there is the first box, choices
// capped at three, text at 240 characters, nothing to show is null), the line typed out by
// characters a second (a beat after punctuation; reduced motion: all at once; a line after
// another typing at once, as the first does), a tap finishing
// the typing and then going on (the next id, the following box, the end), choices shown once
// the line is typed and leading where they say, Auto going on after the box's wait or one from
// the line's length, Next to the next box with choices or the end, the log of lines shown (plain
// text) and replies picked, text effects' tags counted by the letters that show, a pause
// holding the clock, and a broken script ending gracefully. Play Intro's script is content.js
// introScript() (content.json's intro, or one mended), which the runner plays as it is. The chat
// screen (dialogueUi.js): its markup and CSS, and on stand-in elements a held press and its end,
// and a finger's drag scrolling a long line from anywhere on the screen, with its fling.
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

test('a line after another types at once, from its first letter, as the first one does', () => {
  const d = run(SCRIPT);
  assert.equal(d.advance(0.1), 'typed');
  assert.equal(d.advance(0.2), 'next');
  assert.equal(d.view.box?.id, 'me');
  assert.equal(d.step(0.2 + 1e-6).shown, 0, 'from its start');
  assert.equal(d.step(0.2 + 1 / DIALOGUE.cps + 1e-6).shown, 1, 'its first letter a letter’s time after it came');
  const v = d.step(0.2 + typeDuration('I am NEWT') + 1e-6);
  assert.ok(v.typed && v.shown === v.length, 'typed as long after it came as the first');
  // (After a reply too: the reply's box types straight away.)
  const r = run(SCRIPT);
  r.skip(0);
  assert.ok(r.choose(0, 0.5));
  assert.equal(r.view.box?.id, 'yes');
  assert.equal(r.step(0.5 + 1 / DIALOGUE.cps + 1e-6).shown, 1);
});

test('a line a press brings on waits its lead, then types from its first letter; Auto, Next and the first line don’t wait', () => {
  const lead = 0.32;
  const letter = 1 / DIALOGUE.cps;
  const d = run(SCRIPT, { lead });
  assert.equal(d.step(letter + 1e-6).shown, 1, 'the first line types at once');
  assert.equal(d.advance(0.1), 'typed');
  assert.equal(d.advance(0.2), 'next');
  assert.equal(d.view.box?.id, 'me');
  assert.equal(d.step(0.2 + lead - 1e-3).shown, 0, 'it waits its lead (the screen fades the lines meanwhile)');
  assert.equal(d.view.typed, false);
  assert.equal(d.step(0.2 + lead + letter + 1e-6).shown, 1, 'then its first letter');
  const v = d.step(0.2 + lead + typeDuration('I am NEWT') + 1e-6);
  assert.ok(v.typed && v.shown === v.length, 'typed as long after its lead as the first');
  // (A tap in its lead finishes it at once, as any tap does.)
  assert.equal(d.advance(0.8), 'next');
  assert.equal(d.advance(0.85), 'typed');
  assert.ok(d.view.typed, 'finished in its lead');
  // (Paused in its lead: the lead waits too.)
  const p = run(SCRIPT, { lead });
  p.advance(0);
  p.advance(0.1);
  p.pause(true, 0.15);
  p.pause(false, 1.15);
  assert.equal(p.step(1.1 + lead - 1e-3).shown, 0, 'still waiting after the pause');
  assert.equal(p.step(1.1 + lead + letter + 1e-6).shown, 1);
  // (A reply picked: its box waits the lead too.)
  const r = run(SCRIPT, { lead });
  r.skip(0);
  assert.ok(r.choose(0, 0.5));
  assert.equal(r.view.box?.id, 'yes');
  assert.equal(r.step(0.5 + lead - 1e-3).shown, 0);
  assert.equal(r.step(0.5 + lead + letter + 1e-6).shown, 1);
  // (Auto going on by itself doesn't: nothing fades.)
  const a = run(SCRIPT, { lead });
  a.setAuto(true, 0);
  let t = 0;
  while (a.view.box?.id === 'hi' && t < 20) a.step((t += 1 / 60));
  assert.equal(a.view.box?.id, 'me');
  assert.equal(a.step(t + letter + 1e-6).shown, 1, 'Auto’s box types at once');
  // (Next goes to the box with replies typed whole, as ever.)
  const n = run(SCRIPT, { lead });
  n.skip(0.1);
  assert.ok(n.view.typed && n.view.box?.id === 'ask');
  // (A lead that isn't a number: none.)
  const z = run(SCRIPT, { lead: NaN });
  z.advance(0);
  z.advance(0.1);
  assert.equal(z.step(0.1 + letter + 1e-6).shown, 1);
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
  assert.ok(!/>Skip<\/(span|button)>/.test(markup), 'no Skip button any more');
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

test('the chat screen is plain, as before round 18: no dither on its buttons or its box, no press flash, no outline round the words; the replies pop in, the ▼ bobs smoothly', async () => {
  const ui = await import('../src/invitation/dialogueUi.js');
  for (const k of ['TALK_DITHER', 'pressFlash', 'SHADE_BANDS']) assert.equal(k in ui, false, `no ${k}`);
  const markup = ui.talkHtml();
  assert.ok(!/inv-talk-flash|inv-talk-label|inv-talk-ghost/.test(markup), 'no flash, no plates, no copy of a line');
  // (The buttons' words straight in them, as before; a reply's styled letters in their holder.)
  for (const b of ['auto', 'skip', 'log', 'log-close', 'no', 'yes'])
    assert.match(markup, new RegExp(`data-talk="${b}"[^>]*>[^<]+</button>`), b);
  assert.match(markup, /data-intro-skip>Skip Intro<\/button>/);
  const src = readFileSync(new URL('../src/invitation/dialogueUi.js', import.meta.url), 'utf8');
  assert.ok(!/inv-talk-label|inv-talk-flash|pressFlash|--talk-ink-|--talk-mask-/.test(src), 'none of it in the screen');
  assert.match(
    src,
    /class="inv-btn inv-talk-choice"[^>]*><span class="inv-talk-choice-text" aria-hidden="true" data-styled=/,
  );

  const css = readFileSync(new URL('../src/invitation/dialogue.css', import.meta.url), 'utf8');
  const rule = (sel, from = 0) => {
    const at = css.indexOf(`${sel} {`, from);
    assert.ok(at >= 0, `a rule for ${sel}`);
    return css.slice(at, css.indexOf('}', at));
  };
  // (No dither anywhere on the screen: no tiles, no background images, no outline round the
  // words; the only dither is the click fade's, run from script.)
  for (const gone of [
    'background-image',
    'image-rendering',
    'text-shadow',
    '--talk-ink-',
    '--talk-mask-',
    'inv-talk-flash',
    'inv-talk-label',
    'inv-talk-dither-in',
    'steps(',
  ])
    assert.ok(!css.includes(gone), `no ${gone}`);
  assert.equal(css.match(/@import /g)?.length, 1, 'the text effects imported once');
  // (The box rises into place with its plain quick fade, as it did.)
  assert.match(rule('.inv-talk-box'), /animation: inv-talk-rise 0\.28s ease-out;/);
  const frames = (name) => new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? '';
  assert.match(frames('inv-talk-rise'), /opacity: 0/);
  // (The replies pop in together, a quick smooth scale and fade, as they did.)
  assert.match(rule('.inv-talk-choices:not(.is-waiting) .inv-talk-choice'), /animation: inv-talk-pop 0\.22s ease-out;/);
  assert.ok(!/nth-child/.test(css), 'together, not one after another');
  const pop = frames('inv-talk-pop');
  assert.match(pop, /opacity: 0/);
  assert.match(pop, /scale: 0\.92/);
  // (The replies on their cream.)
  assert.match(css, /\.inv-talk-choice \{[^}]*(background|--talk-btn-fill): var\(--talk-fill\)/);
  // (The ▼ bobs smoothly, as it did.)
  assert.match(rule('.inv-talk-next'), /animation: inv-talk-bob 0\.9s ease-in-out infinite;/);
  assert.match(frames('inv-talk-bob'), /50% \{\s*transform: translateY\(4px\);/);
  // (A finger held on a button presses it down as the mouse's :active does: holdPressed.)
  const pressed = /\.inv-talk \.inv-btn\.is-pressed:not\(:disabled\) \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(pressed, /transform: translateY\(3px\)/);
  assert.match(pressed, /box-shadow: 0 1px 0 var\(--talk-ink\)/);
  // (Reduced motion: no rise, no bob, no pop, the dim just there.)
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  const still = /([^{}]+)\{\s*animation: none;\s*\}/.exec(reduced)?.[1] ?? '';
  for (const sel of [
    '.inv-talk-next',
    '.inv-talk-box',
    '.inv-talk-dim',
    '.inv-talk-choices:not(.is-waiting) .inv-talk-choice',
  ])
    assert.ok(
      still
        .split(',')
        .map((v) => v.trim())
        .includes(sel),
      `reduced motion: ${sel} still`,
    );
});

test('a light plain hover and a plain pressed state on the buttons and the box: a step warmer, a step darker and down, never a dither', async () => {
  const css = readFileSync(new URL('../src/invitation/dialogue.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at >= 0, `a rule for ${sel}`);
    return css.slice(at, css.indexOf('}', at));
  };
  // (Each button's steps from its own fill: paper, the replies' cream, the on colour of Auto and
  // Log while they're on; warmer toward the on colour, darker toward the ink.)
  const btn = rule('.inv-talk .inv-btn');
  assert.match(btn, /--talk-btn-fill: var\(--inv-paper/);
  assert.match(btn, /--talk-btn-hover: color-mix\(in srgb, var\(--talk-btn-fill\), var\(--inv-on[^)]*\) \d+%\)/);
  assert.match(btn, /--talk-btn-down: color-mix\(in srgb, var\(--talk-btn-fill\), var\(--talk-ink\) \d+%\)/);
  assert.match(btn, /background: var\(--talk-btn-fill\)/);
  assert.match(rule('.inv-talk .inv-talk-choice'), /--talk-btn-fill: var\(--talk-fill\)/);
  const on = rule(".inv-talk .inv-btn[aria-pressed='true'],\n.inv-talk .inv-btn[aria-expanded='true']");
  assert.match(on, /--talk-btn-fill: var\(--inv-on/);
  assert.match(on, /--talk-btn-hover: color-mix\(in srgb, var\(--talk-btn-fill\), #fff \d+%\)/, 'on: lighter');
  // (Hover only where there's a mouse: a step warmer and lifted a pixel, its drop a pixel longer.)
  const hoverAt = css.indexOf('@media (hover: hover) and (pointer: fine)');
  assert.ok(hoverAt >= 0);
  const hover = css.slice(hoverAt, css.indexOf('\n}\n', hoverAt));
  const over = /\.inv-talk \.inv-btn:hover:not\(:disabled\) \{([^}]*)\}/.exec(hover)?.[1] ?? '';
  assert.match(over, /background-color: var\(--talk-btn-hover\)/);
  assert.match(over, /transform: translateY\(-1px\)/);
  assert.match(over, /box-shadow: 0 5px 0 var\(--talk-ink\)/);
  assert.match(hover, /\.inv-talk \.inv-talk-btn:hover:not\(:disabled\) \{\s*box-shadow: 0 4px 0 var\(--talk-ink\)/);
  // (Pressed, by the mouse or a finger held on it: a step darker, down its drop.)
  const down =
    /\.inv-talk \.inv-btn:active:not\(:disabled\),\n\.inv-talk \.inv-btn\.is-pressed:not\(:disabled\) \{([^}]*)\}/.exec(
      css,
    )?.[1] ?? '';
  assert.match(down, /background-color: var\(--talk-btn-down\)/);
  assert.match(down, /transform: translateY\(3px\)/);
  assert.match(down, /box-shadow: 0 1px 0 var\(--talk-ink\)/);
  // (The box goes on when pressed, so it answers the same way: a step warmer under the mouse, a
  // step darker and down 2 px pressed; not while the replies are up or the Log or the question
  // is open, when a press on it goes nowhere.)
  const live = '.inv-talk:not(.is-choosing, .is-modal) .inv-talk-box';
  assert.match(
    hover,
    new RegExp(
      `${live.replace(/[.()]/g, '\\$&')}:hover \\{\\s*background-color: color-mix\\(in srgb, var\\(--talk-fill\\), var\\(--inv-on`,
    ),
  );
  const boxDown =
    new RegExp(
      `${live.replace(/[.()]/g, '\\$&')}:active,\\n${live.replace(/[.()]/g, '\\$&')}\\.is-pressed \\{([^}]*)\\}`,
    ).exec(css)?.[1] ?? '';
  assert.match(boxDown, /background-color: color-mix\(in srgb, var\(--talk-fill\), var\(--talk-ink\) \d+%\)/);
  assert.match(boxDown, /translate: 0 2px/);
  assert.match(boxDown, /box-shadow: 0 2px 0 var\(--talk-ink\)/);
  assert.match(rule('.inv-talk-box'), /transition:[^;]*background-color/);
  // (The screen: a finger held on the box shows it pressed too; under the Log or the question the
  // layer says so.)
  const src = readFileSync(new URL('../src/invitation/dialogueUi.js', import.meta.url), 'utf8');
  assert.match(src, /holdPressed\(layer, 'is-pressed', 'button, \.inv-talk-box'\)/);
  assert.match(src, /layer\.classList\.toggle\('is-modal', modal\(\)\)/);
});

test('a press that goes on, or a reply picked: the old line dithers out, then the next in, each in a few held Bayer steps', async () => {
  const { TALK_FADE, TALK_LEAD, fadeFrames, talkTile } = await import('../src/invitation/dialogueUi.js');
  // (Short: about a sixth of a second each way, and the next line types once both are over.)
  assert.ok(TALK_FADE.ms >= 150 && TALK_FADE.ms <= 200, `each way ${TALK_FADE.ms} ms`);
  assert.equal(TALK_LEAD, (2 * TALK_FADE.ms) / 1000, 'the runner’s lead: out, then in');
  assert.ok(TALK_FADE.plainMs > 0 && TALK_FADE.plainMs < TALK_FADE.ms, 'reduced motion: a quicker plain fade');
  // (The steps: the coverages, heavy to light, each the toolbar's Bayer tile at 2 px a cell.)
  const { steps } = TALK_FADE;
  assert.ok(steps.length >= 2 && steps.length <= 4, `a few steps: ${steps}`);
  assert.ok(
    steps.every((n, i) => n > 0 && n < 16 && (i === 0 || n < steps[i - 1])),
    'down from heavy to light',
  );
  for (const n of [0, ...steps]) {
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
  const heavier = talkTile(steps[0]);
  assert.ok(
    talkTile(steps.at(-1)).every((on, i) => !on || heavier[i]),
    'a lighter tile’s cells are in the heavier one',
  );
  const masks = new Map([0, ...steps].map((n) => [n, `url(tile-${n})`]));
  const out = fadeFrames(true, masks);
  const inn = fadeFrames(false, masks);
  assert.deepEqual(
    out.map((f) => f.maskImage),
    [...steps.map((n) => `url(tile-${n})`), 'url(tile-0)'],
    'out: lighter step by step, then nothing (held there till it goes)',
  );
  assert.deepEqual(
    inn.map((f) => f.maskImage),
    [...[...steps].reverse().map((n) => `url(tile-${n})`), 'none'],
    'in: heavier step by step, then whole',
  );
  for (const frames of [out, inn]) {
    assert.deepEqual(
      frames.map((f) => f.offset),
      frames.map((_, i) => i / (frames.length - 1)),
      'even steps',
    );
    for (const f of frames) assert.equal(f.easing, 'steps(1, end)', 'each held: a dither steps, it never blends');
  }

  // (The old line's copy, over the new one where it was, takes no press; nor do the replies'.)
  const css = readFileSync(new URL('../src/invitation/dialogue.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at >= 0, `a rule for ${sel}`);
    return css.slice(at, css.indexOf('}', at));
  };
  // (Its own rule: the last of its name, after the one it shares with the line.)
  const ghostAt = css.lastIndexOf('\n.inv-talk-ghost {');
  assert.ok(ghostAt >= 0, 'a rule for .inv-talk-ghost');
  const ghost = css.slice(ghostAt, css.indexOf('}', ghostAt));
  for (const d of [/position: absolute/, /inset: 0/, /overflow: hidden/, /pointer-events: none/])
    assert.match(ghost, d);
  assert.match(rule('.inv-talk-choices.is-ghost'), /pointer-events: none/);
  // (The line's type is its view's, so the copy is set just as the line was; the admin's own line
  // breaks show in the line and in its copy, never in the view, where the markup's breaks
  // between its parts would each take a row.)
  const view = rule('.inv-talk-view');
  for (const d of [/font-size: 18px/, /line-height: 1\.42/, /overflow-wrap: break-word/]) assert.match(view, d);
  assert.ok(!/white-space/.test(view), 'no breaks kept in the view');
  assert.ok(!/font-size/.test(rule('.inv-talk-text')), 'the line takes its view’s type');
  assert.match(css, /\.inv-talk-text,\n\.inv-talk-ghost \{\s*white-space: pre-line;/);
});

test('a long line grows the box a row at most (four rows, three on a short screen), then scrolls in it, following the typing a row at a time', async () => {
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
  // (Rows, not a share of the screen: no size container, nothing measured in cqh.)
  assert.ok(!/container-type|cqh/.test(css), 'no share of the screen');
  // (Three rows at least on a phone and a desktop, two on a short screen, so a short line keeps
  // the shape the box had before round 18; a longer line grows it by a row at most, four rows
  // (three on a short screen), and past that it scrolls.)
  /** The rules inside the `@media` starting `media` (to its closing brace). */
  const media = (start) => {
    const i = css.indexOf(start);
    assert.ok(i >= 0, start);
    let depth = 0;
    for (let j = css.indexOf('{', i); j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) return css.slice(i, j + 1);
    }
    assert.fail(`${start} unclosed`);
  };
  /** A declaration of `.inv-talk-text` in `block` (or the base rule's, when the block has none). */
  const textRows = (block, prop) => {
    const at = block.indexOf('.inv-talk-text {');
    const own =
      at >= 0
        ? new RegExp(`${prop}: calc\\((\\d) \\* 1\\.42em\\)`).exec(block.slice(at, block.indexOf('}', at)))
        : null;
    return Number((own ?? new RegExp(`${prop}: calc\\((\\d) \\* 1\\.42em\\)`).exec(rule('.inv-talk-text')))?.[1]);
  };
  const base = css.slice(0, css.indexOf('@media'));
  const layouts = [
    { name: 'a phone', block: base, least: 3 },
    { name: 'a desktop', block: media('@media (min-width: 700px)'), least: 3 },
    { name: 'a short screen', block: media('@media (orientation: landscape)'), least: 2 },
  ];
  for (const { name, block, least } of layouts) {
    assert.equal(textRows(block, 'min-height'), least, `${name}: ${least} rows at least`);
    assert.equal(textRows(block, 'max-height'), least + 1, `${name}: a row more at most`);
  }
  // (A short screen's box is shorter: no 132 px floor under its two rows.)
  assert.match(rule('.inv-talk-box', css.indexOf('@media (orientation: landscape)')), /min-height: 0/);
  // (Its line hidden past the room, its scrollbar unseen; once it's all typed the wheel, a finger
  // and the keys scroll it.)
  const text = rule('.inv-talk-text');
  assert.match(text, /overflow-y: hidden/);
  assert.match(text, /scrollbar-width: none/);
  const free = rule('.inv-talk-text.can-scroll');
  assert.match(free, /overflow-y: auto/);
  assert.match(free, /overscroll-behavior: contain/);
  // (A finger's drag is the screen's own, from anywhere on it (dragScroll): the browser never pans
  // the line itself, which as a scroller would take its pan back from the layer's none.)
  assert.match(text, /touch-action: none/);
  assert.ok(!/touch-action/.test(free), 'no pan of its own once it scrolls');
});

test('the chat box has no dark dither of its own; behind it, the gentle plain dim it had before round 18', async () => {
  const ui = await import('../src/invitation/dialogueUi.js');
  assert.equal('SHADE_BANDS' in ui, false, 'no bands');
  const markup = ui.talkHtml();
  assert.ok(!/inv-talk-shade/.test(markup), 'nothing in the box');
  const css = readFileSync(new URL('../src/invitation/dialogue.css', import.meta.url), 'utf8');
  assert.ok(!/inv-talk-shade|is-receding|--talk-band|--talk-sink-steps/.test(css), 'no rules for it');
  const src = readFileSync(new URL('../src/invitation/dialogueUi.js', import.meta.url), 'utf8');
  assert.ok(!/is-receding/.test(src), 'no hover, focus or press makes anything recede');
  // (The dim: first in the layer, under all of it, hidden from a screen reader.)
  assert.match(markup, /^<div class="inv-talk-dim" aria-hidden="true"><\/div>/);
  const at = css.indexOf('.inv-talk-dim {');
  assert.ok(at >= 0, 'a rule for the dim');
  const dim = css.slice(at, css.indexOf('}', at));
  // (A smooth gradient of the ink up from the bottom, gone by the middle: no dither, no tiles.)
  assert.match(dim, /background: linear-gradient\(\s*to top,/);
  assert.match(dim, /transparent 48%/);
  assert.ok(!/mask|url\(|var\(--talk-ink-/.test(dim), 'plain, not dithered');
  assert.match(dim, /pointer-events: none/);
  // (It fades in plainly with the screen; reduced motion, it's just there.)
  assert.match(dim, /animation: inv-talk-fade 0\.35s ease-out/);
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.inv-talk-dim[,\s][\s\S]*?animation: none/);
});

// ---- the screen's presses on stand-in elements ---------------------------------------------

/**
 * Just enough of a tree for holdPressed: elements with classes, a parent, listeners, closest()
 * by tag and a pointer capture; events bubble up to the document and the window, but
 * pointerleave stays on its element (as in a browser).
 */
function pressTree() {
  const win = stand('window', null);
  const doc = stand('document', win);
  doc.defaultView = win;
  const root = stand('div', doc);
  const next = stand('button', root);
  const label = stand('span', next);
  const reply = stand('button', root);
  const off = stand('p', root);
  const box = stand('section', root);
  box.classes.add('inv-talk-box');
  const line = stand('p', box);
  for (const el of [root, next, label, reply, off, box, line]) el.ownerDocument = doc;
  return { win, doc, root, next, label, reply, off, box, line };
}
/** @param {string} tag @param {any} parent */
function stand(tag, parent) {
  /** @type {any} */
  const el = {
    tagName: tag.toUpperCase(),
    parent,
    disabled: false,
    captured: false,
    classes: new Set(),
    on: /** @type {Record<string, Function[]>} */ ({}),
    addEventListener: (type, f) => (el.on[type] ??= []).push(f),
    removeEventListener: (type, f) => (el.on[type] = (el.on[type] ?? []).filter((g) => g !== f)),
    // (By tag or by class, in a list: 'button, .inv-talk-box'.)
    closest: (sel) => {
      const any = sel.split(',').map((v) => v.trim());
      for (let n = el; n; n = n.parent)
        if (any.some((v) => (v.startsWith('.') ? n.classes?.has(v.slice(1)) : n.tagName === v.toUpperCase()))) return n;
      return null;
    },
    hasPointerCapture: () => el.captured,
    releasePointerCapture: () => (el.captured = false),
    // (Every element's box: 0 to 100 px across, 0 to 40 down.)
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 40 }),
  };
  el.classList = {
    add: (c) => el.classes.add(c),
    remove: (c) => el.classes.delete(c),
    contains: (c) => el.classes.has(c),
  };
  return el;
}
/** A pointer event on `target`, bubbling (but pointerleave). */
function fire(target, type, o = {}) {
  const e = { type, target, pointerId: 1, button: 0, ...o };
  for (let n = target; n; n = type === 'pointerleave' ? null : n.parent) for (const f of n.on[type] ?? []) f(e);
}

test('a press held on a button shows pressed until it lifts, is cancelled or slides off (CSS :active isn’t reliable on touch)', async () => {
  const { holdPressed } = await import('../src/invitation/dialogueUi.js');
  const t = pressTree();
  holdPressed(t.root);
  const pressed = (el) => el.classList.contains('is-pressed');
  // (A finger on Next's label: Next shows pressed, its implicit capture let go so sliding off counts.)
  t.next.captured = true;
  fire(t.label, 'pointerdown', { pointerId: 3 });
  assert.ok(pressed(t.next), 'pressed from pointerdown');
  assert.equal(t.next.captured, false, 'the finger’s capture let go');
  fire(t.off, 'pointerup', { pointerId: 9 });
  assert.ok(pressed(t.next), 'another pointer lifting leaves it');
  fire(t.label, 'pointerup', { pointerId: 3 });
  assert.ok(!pressed(t.next), 'lifted: not pressed');
  // (Cancelled, as when the browser takes the touch.)
  fire(t.reply, 'pointerdown', { pointerId: 4 });
  assert.ok(pressed(t.reply));
  fire(t.reply, 'pointercancel', { pointerId: 4 });
  assert.ok(!pressed(t.reply), 'cancelled: not pressed');
  // (Slid off it: not pressed, even before the finger lifts somewhere else; a finger still held
  // by its button gets no pointerleave there, so its moves say when it's off the button's box.)
  fire(t.next, 'pointerdown', { pointerId: 5 });
  fire(t.next, 'pointerleave', { pointerId: 5 });
  assert.ok(!pressed(t.next), 'left: not pressed');
  fire(t.off, 'pointerup', { pointerId: 5 });
  fire(t.next, 'pointerdown', { pointerId: 11, clientX: 50, clientY: 20 });
  fire(t.next, 'pointermove', { pointerId: 11, clientX: 90, clientY: 35 });
  assert.ok(pressed(t.next), 'moved about on it: still pressed');
  fire(t.next, 'pointermove', { pointerId: 12, clientX: 300, clientY: 300 });
  assert.ok(pressed(t.next), 'another pointer moving leaves it');
  fire(t.next, 'pointermove', { pointerId: 11, clientX: 140, clientY: 20 });
  assert.ok(!pressed(t.next), 'moved off its box: not pressed');
  fire(t.next, 'pointerup', { pointerId: 11 });
  // (Lifted over the window, outside the layer: still let go.)
  fire(t.reply, 'pointerdown', { pointerId: 6 });
  for (const f of t.win.on.pointerup ?? []) f({ type: 'pointerup', target: t.win, pointerId: 6 });
  assert.ok(!pressed(t.reply), 'lifted anywhere');
  // (Off the buttons, on a disabled one, or the mouse's other buttons: nothing shows pressed.)
  fire(t.off, 'pointerdown', { pointerId: 7 });
  t.reply.disabled = true;
  fire(t.reply, 'pointerdown', { pointerId: 8 });
  t.reply.disabled = false;
  fire(t.next, 'pointerdown', { pointerId: 10, button: 2 });
  assert.ok(!pressed(t.next) && !pressed(t.reply), 'none pressed');
  // (Off the buttons on the box: nothing, unless the box is asked for too, as the screen asks.)
  fire(t.line, 'pointerdown', { pointerId: 13 });
  assert.ok(!pressed(t.box), 'the box is no button');
  fire(t.line, 'pointerup', { pointerId: 13 });
  const t3 = pressTree();
  holdPressed(t3.root, 'is-pressed', 'button, .inv-talk-box');
  t3.box.captured = true;
  fire(t3.line, 'pointerdown', { pointerId: 2 });
  assert.ok(pressed(t3.box), 'a finger on the box shows it pressed');
  assert.equal(t3.box.captured, false, 'its capture let go');
  fire(t3.line, 'pointermove', { pointerId: 2, clientX: 300, clientY: 20 });
  assert.ok(!pressed(t3.box), 'slid off it: not pressed');
  fire(t3.line, 'pointerdown', { pointerId: 4 });
  fire(t3.line, 'pointerup', { pointerId: 4 });
  assert.ok(!pressed(t3.box), 'lifted: not pressed');
  fire(t3.label, 'pointerdown', { pointerId: 5 });
  assert.ok(pressed(t3.next) && !pressed(t3.box), 'a button still its own press');
  // (Disposed: presses show nothing.)
  const t2 = pressTree();
  holdPressed(t2.root)();
  fire(t2.next, 'pointerdown', { pointerId: 1 });
  assert.ok(!pressed(t2.next), 'disposed');
});

test('a finger held on a button and dragged past the slop is a drag, not a press: it shows pressed no longer', async () => {
  const { holdPressed, DRAG } = await import('../src/invitation/dialogueUi.js');
  const t = pressTree();
  holdPressed(t.root, 'is-pressed', 'button, .inv-talk-box');
  const pressed = (el) => el.classList.contains('is-pressed');
  const touch = { pointerType: 'touch', pointerId: 2 };
  fire(t.line, 'pointerdown', { ...touch, clientX: 50, clientY: 20 });
  fire(t.line, 'pointermove', { ...touch, clientX: 50, clientY: 20 + DRAG.slop - 1 });
  assert.ok(pressed(t.box), 'within the slop: still pressed');
  fire(t.line, 'pointermove', { ...touch, clientX: 50, clientY: 20 + DRAG.slop + 1 });
  assert.ok(!pressed(t.box), 'past it, on the box still: a drag (it scrolls the line), not pressed');
  fire(t.line, 'pointerup', touch);
  // (The mouse keeps its press while it stays on the button, as a click does.)
  fire(t.next, 'pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 20, clientY: 10 });
  fire(t.next, 'pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 20, clientY: 30 });
  assert.ok(pressed(t.next), 'the mouse moved on it: still pressed');
});

/**
 * A scroller for dragScroll on the stand-in tree (pressTree's line, in the box): its view 100 px
 * of 600, scrollTop kept in range as a browser keeps it; a clock and frames run by hand.
 */
function scrollTree() {
  const t = pressTree();
  const clock = { t: 1000 };
  /** @type {Map<number, Function>} */
  const frames = new Map();
  let ids = 0;
  t.win.performance = { now: () => clock.t };
  t.win.requestAnimationFrame = (f) => (frames.set(++ids, f), ids);
  t.win.cancelAnimationFrame = (id) => frames.delete(id);
  const sc = t.line;
  let top = 0;
  Object.defineProperty(sc, 'scrollTop', {
    get: () => top,
    set: (v) => {
      top = Math.min(Math.max(0, v), sc.scrollHeight - sc.clientHeight);
    },
  });
  sc.scrollHeight = 600;
  sc.clientHeight = 100;
  /** Frames run for `ms` (16 ms apart): the clock on, each frame's callbacks called. */
  const frameFor = (ms) => {
    for (let at = 0; at < ms; at += 16) {
      clock.t += 16;
      const due = [...frames.values()];
      frames.clear();
      for (const f of due) f(clock.t);
    }
  };
  /** A pointer event on the page's clock (timeStamp), a finger's unless said. */
  const at = (target, type, o = {}) =>
    fire(target, type, { pointerType: 'touch', pointerId: 1, isPrimary: true, timeStamp: clock.t, ...o });
  /** A click (detail 1: a tap's, not a key's): whether it was stopped and its default prevented. */
  const click = (target, detail = 1) => {
    const e = { stopped: false, prevented: false };
    fire(target, 'click', {
      detail,
      stopPropagation: () => (e.stopped = true),
      preventDefault: () => (e.prevented = true),
    });
    return e;
  };
  /** A flick up the screen: past the slop, then `px` px every 10 ms four times, lifted at once. */
  const flick = (px, y = 300) => {
    at(t.off, 'pointerdown', { clientX: 10, clientY: y });
    for (let k = 1; k <= 4; k++) {
      clock.t += 10;
      at(t.off, 'pointermove', { clientX: 10, clientY: y - 8 - k * px });
    }
    at(t.off, 'pointerup', {});
  };
  return { ...t, clock, frames, run: frameFor, at, click, flick, sc };
}

test('a finger drag anywhere on the screen scrolls a long line: from the box, a button or the stage over it, with no jump', async () => {
  const { dragScroll, DRAG } = await import('../src/invitation/dialogueUi.js');
  const t = scrollTree();
  let can = true;
  dragScroll(t.root, t.sc, { canScroll: () => can, skip: (el) => el === t.reply });
  t.sc.scrollTop = 300;
  // (A finger up the stage, off the line: it scrolls the line down by what it went past the slop.)
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 400 });
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 400 - DRAG.slop });
  assert.equal(t.sc.scrollTop, 300, 'within the slop: nothing yet');
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 400 - DRAG.slop - 50 });
  assert.equal(t.sc.scrollTop, 350, 'past it, with the finger, a px a px');
  // (Past the end and back: it moves back at once, nothing piled up past the end.)
  t.at(t.off, 'pointermove', { clientX: 10, clientY: -400 });
  assert.equal(t.sc.scrollTop, 500, 'held at the end');
  t.at(t.off, 'pointermove', { clientX: 10, clientY: -380 });
  assert.equal(t.sc.scrollTop, 480, 'back at once');
  t.clock.t += DRAG.sample * 2;
  t.at(t.off, 'pointerup', { clientX: 10, clientY: -380 });
  assert.equal(t.frames.size, 0, 'no fling after a finger that had stopped');
  // (From a button, Next's label: the same.)
  t.at(t.label, 'pointerdown', { clientX: 10, clientY: 100 });
  t.at(t.label, 'pointermove', { clientX: 10, clientY: 100 + DRAG.slop + 30 });
  assert.equal(t.sc.scrollTop, 450, 'down the screen: back up the line');
  t.at(t.label, 'pointercancel', {});
  // (The mouse keeps the wheel and the keys; a press where skip() says it isn't the screen's
  // (the Log, the question), or a second finger: nothing.)
  t.at(t.off, 'pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 100 });
  t.at(t.off, 'pointermove', { pointerType: 'mouse', clientX: 10, clientY: 300 });
  t.at(t.off, 'pointerup', { pointerType: 'mouse' });
  t.at(t.reply, 'pointerdown', { clientX: 10, clientY: 100, pointerId: 4 });
  t.at(t.reply, 'pointermove', { clientX: 10, clientY: 300, pointerId: 4 });
  t.at(t.reply, 'pointerup', { pointerId: 4 });
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 100, pointerId: 5, isPrimary: false });
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 300, pointerId: 5, isPrimary: false });
  t.at(t.off, 'pointerup', { pointerId: 5, isPrimary: false });
  assert.equal(t.sc.scrollTop, 450, 'none of those scrolled it');
  // (Begun while the line can't scroll (it still types): nothing till it can, then on from where
  // the view is then, with the finger's moves from there.)
  can = false;
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 500, pointerId: 6 });
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 440, pointerId: 6 });
  assert.equal(t.sc.scrollTop, 450, 'not while it can’t');
  t.sc.scrollTop = 200;
  can = true;
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 430, pointerId: 6 });
  assert.equal(t.sc.scrollTop, 210, 'it can now: on from where the view is, by the finger’s last move');
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 400, pointerId: 6 });
  assert.equal(t.sc.scrollTop, 240, 'and with the finger from there');
  t.at(t.off, 'pointerup', { pointerId: 6 });
});

test('a drag never goes on: its click goes nowhere, a tap’s still does, and a key’s press is never stopped', async () => {
  const { dragScroll, DRAG } = await import('../src/invitation/dialogueUi.js');
  const t = scrollTree();
  dragScroll(t.root, t.sc, { canScroll: () => true, skip: () => false });
  t.sc.scrollTop = 300;
  // (A tap, moving less than the slop: its click goes on.)
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 100 });
  t.at(t.off, 'pointermove', { clientX: 12, clientY: 100 + DRAG.slop - 2 });
  t.at(t.off, 'pointerup', {});
  assert.equal(t.click(t.off).stopped, false, 'a tap goes on');
  // (A drag: the click a browser may still send after it goes nowhere, once.)
  t.at(t.next, 'pointerdown', { clientX: 10, clientY: 100 });
  t.at(t.next, 'pointermove', { clientX: 10, clientY: 160 });
  t.clock.t += DRAG.sample * 2;
  t.at(t.next, 'pointerup', {});
  const after = t.click(t.next);
  assert.ok(after.stopped && after.prevented, 'a drag’s click goes nowhere');
  assert.equal(t.click(t.next).stopped, false, 'only the one');
  // (A drag whose click never comes: the next tap still goes on.)
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 100 });
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 160 });
  t.clock.t += DRAG.sample * 2;
  t.at(t.off, 'pointerup', {});
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 100 });
  t.at(t.off, 'pointerup', {});
  assert.equal(t.click(t.off).stopped, false, 'a tap after a drag goes on');
  // (A click long after a drag isn't its.)
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 100 });
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 160 });
  t.clock.t += DRAG.sample * 2;
  t.at(t.off, 'pointerup', {});
  t.clock.t += DRAG.click + 1;
  assert.equal(t.click(t.off).stopped, false, 'too late to be the drag’s');
  // (Enter or Space on a focused button, after a drag: its click, detail 0, is never stopped.)
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 100 });
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 160 });
  t.at(t.off, 'pointerup', {});
  assert.equal(t.click(t.next, 0).stopped, false, 'a key’s press goes');
});

test('a quick lift flings the line on, slowing to rest; a touch on a fast fling only stops it, on a slow one it goes on', async () => {
  const { dragScroll, DRAG } = await import('../src/invitation/dialogueUi.js');
  const t = scrollTree();
  dragScroll(t.root, t.sc, { canScroll: () => true, skip: () => false });
  // (1.5 px/ms up the screen, from 100: 60 px with the finger, then on.)
  t.sc.scrollTop = 100;
  t.flick(15);
  assert.equal(t.sc.scrollTop, 160, 'with the finger');
  assert.ok(t.frames.size > 0, 'a fling');
  t.run(100);
  const on = t.sc.scrollTop;
  assert.ok(on > 190, `on after the finger (${on})`);
  // (A touch while it still goes fast: it stops there, and that tap goes nowhere.)
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 300 });
  t.at(t.off, 'pointerup', {});
  assert.equal(t.click(t.off).stopped, true, 'the touch that stops a fast fling goes nowhere');
  t.run(200);
  assert.equal(t.sc.scrollTop, on, 'stopped where it was');
  assert.equal(t.frames.size, 0, 'no frames asked for');
  // (Left alone it slows to rest: about speed × tau on, 0.5 px/ms here.)
  t.sc.scrollTop = 0;
  t.flick(5);
  assert.equal(t.sc.scrollTop, 20);
  t.run(3000);
  assert.equal(t.frames.size, 0, 'at rest');
  const all = 20 + 0.5 * DRAG.tau;
  const went = t.sc.scrollTop;
  assert.ok(went <= all && went > all - DRAG.rest * DRAG.tau - 2, `${went} px, ${all} at most`);
  // (At the line's end it stops there.)
  t.sc.scrollTop = 450;
  t.flick(15);
  t.run(3000);
  assert.equal(t.sc.scrollTop, 500, 'held at the end');
  assert.equal(t.frames.size, 0, 'stopped at the end');
  // (Slowing, slower than DRAG.stops: a tap stops it and still goes on.)
  t.sc.scrollTop = 0;
  t.flick(5);
  t.run(500);
  assert.ok(t.frames.size > 0, 'still going, slowly');
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 300 });
  t.at(t.off, 'pointerup', {});
  assert.equal(t.frames.size, 0, 'stopped');
  assert.equal(t.click(t.off).stopped, false, 'a tap on a fling about to rest goes on');
});

test('a fling or a drag starts over for the next line (stop), a fling stops once the line can’t scroll; disposed, nothing scrolls', async () => {
  const { dragScroll, DRAG } = await import('../src/invitation/dialogueUi.js');
  const t = scrollTree();
  let can = true;
  const drag = dragScroll(t.root, t.sc, { canScroll: () => can, skip: () => false });
  t.sc.scrollTop = 100;
  t.flick(15);
  drag.stop();
  // (The next line from its top.)
  t.sc.scrollTop = 0;
  t.run(500);
  assert.equal(t.sc.scrollTop, 0, 'the fling of the line before never scrolls the next');
  // (A drag under way as the line changes takes the new view on from where it is.)
  t.sc.scrollTop = 300;
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 300 });
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 300 - DRAG.slop - 20 });
  assert.equal(t.sc.scrollTop, 320);
  drag.stop();
  t.sc.scrollTop = 0;
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 300 - DRAG.slop - 30 });
  assert.equal(t.sc.scrollTop, 10, 'on from the new line’s top, no jump');
  t.clock.t += DRAG.sample * 2;
  t.at(t.off, 'pointerup', {});
  // (A fling stops once the line can't scroll: a new line not typed yet, the screen going.)
  t.sc.scrollTop = 100;
  t.flick(15);
  can = false;
  const at = t.sc.scrollTop;
  t.run(200);
  assert.equal(t.sc.scrollTop, at, 'stopped');
  assert.equal(t.frames.size, 0);
  can = true;
  drag.dispose();
  t.at(t.off, 'pointerdown', { clientX: 10, clientY: 300 });
  t.at(t.off, 'pointermove', { clientX: 10, clientY: 100 });
  assert.equal(t.sc.scrollTop, at, 'disposed: nothing');
});

test('a finger’s speed as it lifts, and a fling’s path: speed × tau at most, slowing to rest in a couple of seconds', async () => {
  const { DRAG, flingBy, flingSpeed, liftSpeed } = await import('../src/invitation/dialogueUi.js');
  // (Up the screen at 1 px/ms: the line scrolls down at 1 px/ms.)
  const up = Array.from({ length: 6 }, (_, k) => ({ t: 1000 + k * 16, y: 500 - k * 16 }));
  assert.ok(Math.abs(liftSpeed(up, 1080) - 1) < 1e-9, 'up the screen: down the line');
  const down = up.map((m) => ({ ...m, y: 1000 - m.y }));
  assert.ok(Math.abs(liftSpeed(down, 1080) + 1) < 1e-9, 'down the screen: up the line');
  assert.equal(liftSpeed(up, 1080 + DRAG.sample + 1), 0, 'held still before it lifted: no speed');
  assert.equal(liftSpeed(up.slice(0, 1), 1000), 0, 'one move: no speed');
  assert.ok(liftSpeed(up, 1150) < 0.5, 'a pause before the lift slows it');
  // (Only its last moves count: a slow start doesn't slow a quick end.)
  const late = [{ t: 0, y: 900 }, { t: 500, y: 890 }, ...up];
  assert.ok(Math.abs(liftSpeed(late, 1080) - 1) < 1e-9);
  assert.equal(flingBy(2, 0), 0);
  assert.equal(flingSpeed(2, 0), 2);
  assert.ok(Math.abs(flingBy(2, 1e6) - 2 * DRAG.tau) < 1e-6, 'speed × tau in all');
  assert.ok(flingBy(2, DRAG.tau) > 0.6 * 2 * DRAG.tau, 'most of it in the first tau');
  assert.ok(flingSpeed(-2, 100) > -2 && flingSpeed(-2, 100) < 0, 'slowing, its way kept');
  const restBy = DRAG.tau * Math.log(3 / DRAG.rest);
  assert.ok(restBy < 2000, `a 3 px/ms flick rests in ${Math.round(restBy)} ms`);
  assert.ok(DRAG.flick > DRAG.rest && DRAG.stops > DRAG.rest, 'a fling starts and a touch stops it above its rest');
});

/** A stand-in for the layer as fadeAway uses it, its animations kept to finish by hand. */
function leavingLayer({ animates = true } = {}) {
  /** @type {any[]} */
  const anims = [];
  /** @type {any} */
  const el = {
    hidden: false,
    classes: new Set(),
    attrs: new Set(),
    toggleAttribute: (n, on) => (on ? el.attrs.add(n) : el.attrs.delete(n)),
    hasAttribute: (n) => el.attrs.has(n),
  };
  el.classList = {
    add: (c) => el.classes.add(c),
    remove: (c) => el.classes.delete(c),
    contains: (c) => el.classes.has(c),
  };
  if (animates)
    el.animate = (frames, o) => {
      const a = { frames, o, onfinish: null, cancelled: false, cancel: () => (a.cancelled = true) };
      anims.push(a);
      return a;
    };
  return { el, anims };
}

test('the intro’s end: the screen takes no press from the start, fades out plainly and quickly, then hides', async () => {
  const { fadeAway, LEAVE_MS } = await import('../src/invitation/dialogueUi.js');
  const order = [];
  const { el, anims } = leavingLayer();
  fadeAway(el, () => order.push(el.hidden ? 'done, hidden' : 'done, showing'));
  // (1. At once: out of reach, so free play has every press and key; still on screen.)
  assert.equal(el.hidden, false, 'still showing');
  assert.ok(el.classList.contains('is-leaving') && el.hasAttribute('inert'), 'out of reach at once');
  // (2. A plain fade, no dither: its opacity down to nothing over a moment.)
  assert.equal(anims.length, 1);
  const { frames, o } = anims[0];
  assert.deepEqual(
    frames.map((f) => f.opacity),
    [1, 0],
  );
  assert.ok(
    frames.every((f) => f.maskImage === undefined && !/steps/.test(f.easing ?? '')),
    'not dithered, not stepped',
  );
  assert.equal(o.duration, LEAVE_MS);
  assert.ok(LEAVE_MS >= 100 && LEAVE_MS <= 200, `quick: ${LEAVE_MS} ms`);
  assert.deepEqual(order, [], 'not done yet');
  // (3. Then hidden, back in reach for next time, its fade let go, and done.)
  anims[0].onfinish();
  assert.equal(el.hidden, true);
  assert.ok(!el.classList.contains('is-leaving') && !el.hasAttribute('inert'), 'ready to open again');
  assert.equal(anims[0].cancelled, true, 'its fade let go, so it opens whole');
  assert.deepEqual(order, ['done, hidden']);

  // (Nothing animates: hidden at once.)
  const still = leavingLayer({ animates: false });
  let done = false;
  fadeAway(still.el, () => (done = true));
  assert.ok(still.el.hidden && done, 'hidden at once');

  // (Opened again before it had gone: the stop puts it back as it was, never hidden after.)
  const back = leavingLayer();
  let ended = false;
  const stop = fadeAway(back.el, () => (ended = true));
  stop();
  assert.equal(back.anims[0].cancelled, true);
  assert.ok(!back.el.classList.contains('is-leaving') && !back.el.hasAttribute('inert'));
  back.anims[0].onfinish?.();
  assert.ok(!back.el.hidden && !ended, 'a late finish changes nothing');

  // (The leaving screen lets presses through to the stage under it.)
  const css = readFileSync(new URL('../src/invitation/dialogue.css', import.meta.url), 'utf8');
  const at = css.indexOf('.inv-talk.is-leaving {');
  assert.ok(at >= 0);
  assert.match(css.slice(at, css.indexOf('}', at)), /pointer-events: none/);
  const ui = await import('../src/invitation/dialogueUi.js');
  assert.equal('ditherAway' in ui, false, 'no dithered end any more');
});
