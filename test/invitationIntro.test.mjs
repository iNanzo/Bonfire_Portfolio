// The invitation toy's intro (content.json `invitation.intro`, a DialogueScript: the chat Play
// Intro opens). src/contentRules.js checks it, each problem at its path: the speaker, the start
// and the boxes, nothing else; unique ids; the start, every Next and every choice leading to a
// box that exists; text up to 240 characters (a warning past 100, the box's three lines on a
// phone); 2 or 3 choices (one alone a warning); faces, animations and cameras
// from the toy's own lists (the cameras the contract's DialogueShot); a box nothing leads to and
// a loop with no choice to leave as warnings; content without an intro (or from before the toy)
// still passes. src/invitation/content.js introScript() reads it the way the toy plays it, each
// box's flow spelled out, a broken part repaired and nothing usable the toy's own short intro.
// The words here are the test's own: content.json's are the admin's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import {
  INTRO_ANIMATIONS,
  INTRO_AUTO,
  INTRO_CAMERAS,
  INTRO_CHOICES_MAX,
  INTRO_CHOICES_MIN,
  INTRO_LABEL_MAX,
  INTRO_SPEAKER_MAX,
  INTRO_TEXT_LONG,
  INTRO_TEXT_MAX,
  validateContent,
} from '../src/contentRules.js';
import { DIALOGUE_CLIPS, FACE_NAMES } from '../src/invitation/clips.js';

const content = () => JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8'));

// content.js reads `virtual:invitation-content` (vite.config.js); here it's content.json's own.
const sub = JSON.stringify(content().invitation ?? {});
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec === 'virtual:invitation-content')
    return { url: 'data:text/javascript,' + encodeURIComponent('export default ' + ${JSON.stringify(sub)}), shortCircuit: true };
  return next(spec, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
const { FALLBACK_INTRO, introFrom, introScript, readContent } = await import('../src/invitation/content.js');

/** A box as the admin stores one: every field, the optional ones empty. */
const box = (id, o = {}) => ({
  id,
  speaker: '',
  text: `Line ${id}.`,
  face: 'neutral',
  animation: 'Talk',
  camera: 'keep',
  next: '',
  end: false,
  auto: 0,
  choices: [],
  ...o,
});
/** A whole, valid intro (its own words): a, then a choice at b between c and d, both on to e, the end. */
const intro = () => ({
  speaker: 'Tester',
  start: 'a',
  boxes: [
    box('a', { text: 'First.' }),
    box('b', {
      text: 'Pick one.',
      animation: 'Think',
      choices: [
        { label: 'Left', next: 'c' },
        { label: 'Right', next: 'd' },
      ],
    }),
    box('c', { text: 'Left it is.', speaker: 'Mystery', face: 'smug', camera: 'close', next: 'e' }),
    box('d', { text: 'Right it is.', face: 'shy', animation: 'Nod', auto: 2.5 }),
    box('e', { text: 'The end.', face: 'happy', animation: 'Wave', camera: 'wide', end: true }),
  ],
});
/** The content with this intro (the rest of content.json's invitation as it is). */
const withIntro = (it) => {
  const c = content();
  c.invitation = { ...(c.invitation ?? {}), intro: it };
  return c;
};
const problems = (it) => validateContent(withIntro(it));
const errorsAt = (it) =>
  problems(it)
    .errors.map((e) => e.path)
    .sort();
const warningsAt = (it) =>
  problems(it)
    .warnings.map((w) => w.path)
    .sort();
const at = (i, key = '') => `invitation.intro.boxes[${i}]${key}`;

// ---- the content rules -------------------------------------------------------------------------

test('an intro passes as a whole; content without one, or from before the toy, still does', () => {
  assert.deepEqual(problems(intro()).errors, []);
  assert.deepEqual(problems(intro()).warnings, []);
  const none = content();
  delete none.invitation?.intro;
  assert.deepEqual(validateContent(none).errors, [], 'no intro: the toy plays its own');
  const old = content();
  delete old.invitation;
  assert.deepEqual(validateContent(old).errors, [], 'no invitation at all');
  // A box's optional fields can be left out (the toy reads them as empty).
  const bare = intro();
  bare.boxes = bare.boxes.map(({ id, text, face, animation, camera, choices, end, next }) => ({
    id,
    text,
    face,
    animation,
    camera,
    ...(choices.length ? { choices } : {}),
    ...(end ? { end } : {}),
    ...(next ? { next } : {}),
  }));
  assert.deepEqual(problems(bare).errors, []);
});

test('its shape: a group with the speaker, the start and a list of boxes, and nothing else', () => {
  assert.deepEqual(errorsAt('x'), ['invitation.intro']);
  assert.deepEqual(errorsAt([]), ['invitation.intro']);
  assert.deepEqual(errorsAt({}), ['invitation.intro.boxes', 'invitation.intro.speaker', 'invitation.intro.start']);
  assert.deepEqual(errorsAt({ ...intro(), extra: 1 }), ['invitation.intro.extra']);
  assert.deepEqual(errorsAt({ ...intro(), boxes: 'a' }), ['invitation.intro.boxes']);
  assert.deepEqual(errorsAt({ ...intro(), boxes: [] }), ['invitation.intro.boxes', 'invitation.intro.start']);
  const none = problems({ ...intro(), boxes: [] }).errors.find((e) => e.path === 'invitation.intro.boxes');
  assert.match(none.message, /at least one/i);
  for (const speaker of ['', '  ', 7, 'x'.repeat(INTRO_SPEAKER_MAX + 1)])
    assert.deepEqual(errorsAt({ ...intro(), speaker }), ['invitation.intro.speaker'], `speaker ${speaker}`);
  assert.deepEqual(errorsAt({ ...intro(), speaker: 'x'.repeat(INTRO_SPEAKER_MAX) }), []);
  const v = intro();
  v.boxes[0] = 'a line';
  assert.ok(errorsAt(v).includes(at(0)), 'a box is a group of fields');
  const missing = intro();
  missing.boxes.push({ next: '' });
  assert.deepEqual(
    errorsAt(missing),
    ['.animation', '.camera', '.face', '.id', '.text'].map((k) => at(5, k)),
    'a box needs its id, line, face, animation and camera',
  );
  const extra = intro();
  extra.boxes[2].wobble = true;
  extra.boxes[1].hidden = true;
  assert.deepEqual(errorsAt(extra), [at(1, '.hidden'), at(2, '.wobble')]);
});

test('ids: lowercase words joined by dashes, each box its own', () => {
  for (const id of ['Hello', 'two words', 'end-', '', 3]) {
    const v = intro();
    v.boxes[3].id = id;
    assert.ok(errorsAt(v).includes(at(3, '.id')), `“${id}” is refused`);
  }
  const ok = intro();
  ok.boxes[3].id = 'reply-2';
  ok.boxes[1].choices[1].next = 'reply-2';
  assert.deepEqual(errorsAt(ok), []);
  const twice = intro();
  twice.boxes[3].id = 'c';
  twice.boxes[1].choices[1].next = 'c';
  assert.deepEqual(errorsAt(twice), [at(3, '.id')], 'the later box with the same id');
  assert.match(problems(twice).errors[0].message, /another box/i);
});

test('the start, every Next and every choice lead to a box that exists', () => {
  const v = intro();
  v.start = 'zz';
  v.boxes[0].next = 'nowhere';
  v.boxes[1].choices[0].next = 'gone';
  v.boxes[1].choices[1].next = '';
  assert.deepEqual(errorsAt(v), [
    at(0, '.next'),
    at(1, '.choices[0].next'),
    at(1, '.choices[1].next'),
    'invitation.intro.start',
  ]);
  const msg = (path) => problems(v).errors.find((e) => e.path === path).message;
  assert.match(msg('invitation.intro.start'), /zz/, 'it names the box it can’t find');
  assert.match(msg(at(0, '.next')), /nowhere/);
  assert.match(msg(at(1, '.choices[1].next')), /pick/i, 'a choice has to lead somewhere');
  const blank = intro();
  blank.start = '';
  assert.deepEqual(errorsAt(blank), ['invitation.intro.start']);
  // An empty Next is the box after it in the list.
  assert.deepEqual(errorsAt(intro()), []);
  const self = intro();
  self.boxes[1].choices[0].next = 'b';
  assert.deepEqual(errorsAt(self), [], 'a choice may ask again');
});

test('text: up to 240 characters and not empty; choices: at most 3, each with a short label', () => {
  for (const text of ['', '   ', 7, 'x'.repeat(INTRO_TEXT_MAX + 1)]) {
    const v = intro();
    v.boxes[2].text = text;
    assert.deepEqual(errorsAt(v), [at(2, '.text')], `text ${String(text).slice(0, 12)}`);
  }
  const long = intro();
  long.boxes[2].text = 'x'.repeat(INTRO_TEXT_MAX);
  assert.deepEqual(errorsAt(long), [], `${INTRO_TEXT_MAX} characters fit`);
  // Past the box's three lines on a phone (measured at 390×844): a warning, at the line.
  assert.equal(INTRO_TEXT_LONG, 100);
  assert.deepEqual(warningsAt(long), [at(2, '.text')]);
  assert.match(problems(long).warnings[0].message, new RegExp(`${INTRO_TEXT_LONG}`));
  const fits = intro();
  fits.boxes[2].text = '🦎'.repeat(INTRO_TEXT_LONG);
  assert.deepEqual(warningsAt(fits), [], `${INTRO_TEXT_LONG} characters fit the box`);
  fits.boxes[2].text += '!';
  assert.deepEqual(warningsAt(fits), [at(2, '.text')]);
  const emoji = intro();
  emoji.boxes[2].text = '🦎'.repeat(INTRO_TEXT_MAX);
  assert.deepEqual(errorsAt(emoji), [], 'characters, not UTF-16 units');
  assert.equal(INTRO_CHOICES_MAX, 3);
  const four = intro();
  four.boxes[1].choices = ['a', 'c', 'd', 'e'].map((next, i) => ({ label: `Choice ${i}`, next }));
  assert.deepEqual(errorsAt(four), [at(1, '.choices')]);
  const three = intro();
  three.boxes[1].choices = ['a', 'c', 'd'].map((next, i) => ({ label: `Choice ${i}`, next }));
  assert.deepEqual(errorsAt(three), []);
  const bad = intro();
  bad.boxes[1].choices = [{ label: '', next: 'c' }, { label: 'x'.repeat(INTRO_LABEL_MAX + 1), next: 'd' }, 'e'];
  assert.deepEqual(errorsAt(bad), [at(1, '.choices[0].label'), at(1, '.choices[1].label'), at(1, '.choices[2]')]);
  const odd = intro();
  odd.boxes[1].choices[0].mood = 'happy';
  delete odd.boxes[1].choices[1].label;
  assert.deepEqual(errorsAt(odd), [at(1, '.choices[0].mood'), at(1, '.choices[1].label')]);
  const notList = intro();
  notList.boxes[1].choices = 'Left or right';
  assert.deepEqual(errorsAt(notList), [at(1, '.choices')]);
});

test('faces, animations and cameras come from the toy’s own lists (the cameras the contract’s shots)', () => {
  for (const face of FACE_NAMES) {
    const v = intro();
    v.boxes[0].face = face;
    assert.deepEqual(errorsAt(v), [], face);
  }
  assert.deepEqual(INTRO_ANIMATIONS, ['none', ...DIALOGUE_CLIPS]);
  for (const animation of INTRO_ANIMATIONS) {
    const v = intro();
    v.boxes[0].animation = animation;
    assert.deepEqual(errorsAt(v), [], animation);
  }
  for (const camera of INTRO_CAMERAS) {
    const v = intro();
    v.boxes[0].camera = camera;
    assert.deepEqual(errorsAt(v), [], camera);
  }
  const types = readFileSync(new URL('../src/invitation/types.js', import.meta.url), 'utf8');
  const shots = types
    .match(/@typedef \{([^}]+)\} DialogueShot\b/)[1]
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(INTRO_CAMERAS, shots, 'the shots types.js names');
  const v = intro();
  v.boxes[0].face = 'grumpy';
  v.boxes[1].animation = 'Run';
  v.boxes[2].animation = 'talk';
  v.boxes[3].camera = 'far';
  assert.deepEqual(errorsAt(v), [at(0, '.face'), at(1, '.animation'), at(2, '.animation'), at(3, '.camera')]);
  assert.match(problems(v).errors.find((e) => e.path === at(0, '.face')).message, /smug/, 'it names the faces');
});

test('auto: seconds in its range; end: a switch; a box’s speaker: short text, empty for the intro’s', () => {
  const [min, max] = INTRO_AUTO;
  for (const auto of [min - 1, max + 0.5, 'soon', Number.NaN]) {
    const v = intro();
    v.boxes[3].auto = auto;
    assert.deepEqual(errorsAt(v), [at(3, '.auto')], `auto ${auto}`);
  }
  for (const auto of [min, max, 2.5]) {
    const v = intro();
    v.boxes[3].auto = auto;
    assert.deepEqual(errorsAt(v), [], `auto ${auto}`);
  }
  const end = intro();
  end.boxes[4].end = 'yes';
  assert.deepEqual(errorsAt(end), [at(4, '.end')]);
  for (const speaker of [7, 'x'.repeat(INTRO_SPEAKER_MAX + 1)]) {
    const v = intro();
    v.boxes[2].speaker = speaker;
    assert.deepEqual(errorsAt(v), [at(2, '.speaker')], `speaker ${speaker}`);
  }
  const next = intro();
  next.boxes[0].next = 4;
  assert.deepEqual(errorsAt(next), [at(0, '.next')], 'Next is an id');
});

test('warnings, not errors: a box nothing leads to, a loop with no choice to leave, what a box’s choices or End override', () => {
  const lost = intro();
  lost.boxes.push(box('f', { text: 'Nobody hears this.' }));
  assert.deepEqual(errorsAt(lost), []);
  assert.deepEqual(warningsAt(lost), [at(5)]);
  assert.match(problems(lost).warnings[0].message, /“f”/, 'it names the box');
  // c → d → c, no choice on the way: tapping on never ends.
  const loop = intro();
  loop.boxes[1].choices.push({ label: 'Out', next: 'e' });
  loop.boxes[2].next = 'd';
  loop.boxes[3].next = 'c';
  assert.deepEqual(errorsAt(loop), []);
  assert.deepEqual(warningsAt(loop), [at(3, '.next')], 'once, at the Next that closes it');
  assert.match(problems(loop).warnings[0].message, /“c”.*“d”|“d”.*“c”/);
  const self = intro();
  self.boxes[4].end = false;
  self.boxes[4].next = 'e';
  assert.deepEqual(warningsAt(self), [at(4, '.next')], 'a box that leads to itself');
  // A loop back to a choice is fine: the visitor can pick another way.
  const again = intro();
  again.boxes[2].next = 'b';
  again.boxes[3].next = 'e';
  assert.deepEqual(problems(again).warnings, []);
  // Choices lead on from their box, so its Next and End do nothing; End beats Next.
  const both = intro();
  both.boxes[1].next = 'e';
  both.boxes[1].end = true;
  both.boxes[4].next = 'a';
  assert.deepEqual(errorsAt(both), []);
  assert.deepEqual(warningsAt(both), [at(1, '.end'), at(1, '.next'), at(4, '.next')]);
  // One reply is only a tap that looks like a choice: 2 or 3 make one.
  assert.equal(INTRO_CHOICES_MIN, 2);
  const one = intro();
  one.boxes[1].choices = [{ label: 'Left', next: 'c' }];
  assert.deepEqual(errorsAt(one), [], 'still saves');
  // (d, which only the other reply led to, is never reached now.)
  assert.deepEqual(warningsAt(one), [at(1, '.choices'), at(3)]);
  const w = problems(one).warnings.find((x) => x.path === at(1, '.choices'));
  assert.match(w.message, /“b”/, 'it names the box');
});

// ---- content.js: the intro as the toy plays it ----------------------------------------------------

test('introFrom: a valid intro as it is, each box’s flow spelled out (one of Next, choices or End)', () => {
  const base = { face: 'neutral', animation: 'Talk', camera: 'keep' };
  assert.deepEqual(introFrom(intro()), {
    speaker: 'Tester',
    start: 'a',
    boxes: [
      { ...base, id: 'a', text: 'First.', next: 'b' },
      {
        ...base,
        id: 'b',
        text: 'Pick one.',
        animation: 'Think',
        choices: [
          { label: 'Left', next: 'c' },
          { label: 'Right', next: 'd' },
        ],
      },
      { ...base, id: 'c', speaker: 'Mystery', text: 'Left it is.', face: 'smug', camera: 'close', next: 'e' },
      { ...base, id: 'd', text: 'Right it is.', face: 'shy', animation: 'Nod', auto: 2.5, next: 'e' },
      { ...base, id: 'e', text: 'The end.', face: 'happy', animation: 'Wave', camera: 'wide', end: true },
    ],
  });
  // The last box ends it when nothing else does.
  const last = intro();
  last.boxes[4].end = false;
  assert.equal(introFrom(last).boxes[4].end, true);
});

test('introFrom: a broken intro repaired field by field', () => {
  const v = intro();
  v.speaker = '';
  v.start = 'zz';
  v.boxes[0].face = 'grumpy';
  v.boxes[0].animation = 'Run';
  v.boxes[0].camera = 'far';
  v.boxes[0].text = '  First.  ';
  v.boxes[0].auto = -3;
  v.boxes[2].next = 'nowhere';
  v.boxes[2].text = 7;
  v.boxes[1].choices.push({ label: 'Gone', next: 'gone' }, { label: '', next: 'e' }, 'x');
  v.boxes[3].end = true;
  v.boxes[3].next = 'a';
  v.boxes[4].end = 'yes';
  v.boxes.push(box('c', { text: 'A second c.' }), { text: 'No id.' }, 'junk');
  const out = introFrom(v);
  assert.equal(out.speaker, FALLBACK_INTRO.speaker, 'no speaker: the toy’s own');
  assert.equal(out.start, 'a', 'no such start: the first box');
  assert.deepEqual(
    out.boxes.map((b) => b.id),
    ['a', 'b', 'c', 'd', 'e'],
    'boxes without an id, or with one taken, left out',
  );
  const [a, b, c, d, e] = out.boxes;
  assert.deepEqual([a.face, a.animation, a.camera, a.text, a.auto], ['neutral', 'none', 'keep', 'First.', undefined]);
  assert.deepEqual(
    b.choices.map((x) => x.next),
    ['c', 'd'],
    'choices that lead nowhere (or say nothing) dropped',
  );
  assert.deepEqual([c.text, c.next], ['', 'd'], 'a Next to nowhere: the box after it');
  assert.deepEqual([d.end, d.next], [true, undefined], 'End beats Next');
  assert.equal(e.end, true, 'the last box ends it');
  const many = intro();
  many.boxes[1].choices = ['a', 'c', 'd', 'e'].map((next, i) => ({ label: `Choice ${i}`, next }));
  many.boxes[1].next = 'e';
  many.boxes[1].end = true;
  const m = introFrom(many).boxes[1];
  assert.equal(m.choices.length, 3, 'at most three choices');
  assert.equal(m.next, undefined, 'choices beat Next…');
  assert.equal(m.end, undefined, '…and End');
  const empty = intro();
  empty.boxes[1].choices = [{ label: 'Gone', next: 'gone' }];
  assert.deepEqual(
    [introFrom(empty).boxes[1].choices, introFrom(empty).boxes[1].next],
    [undefined, 'c'],
    'no choice left: on to the next box',
  );
});

test('introFrom: nothing usable is the toy’s own short intro, which passes the rules', async () => {
  for (const raw of [undefined, null, 'x', [], {}, { boxes: [] }, { boxes: [1, { text: 'No id.' }] }])
    assert.deepEqual(introFrom(raw), FALLBACK_INTRO, JSON.stringify(raw));
  assert.notEqual(introFrom(undefined), FALLBACK_INTRO, 'a copy');
  assert.ok(FALLBACK_INTRO.boxes.length >= 2, 'a few boxes');
  assert.deepEqual(problems(FALLBACK_INTRO).errors, []);
  assert.deepEqual(problems(FALLBACK_INTRO).warnings, []);
  assert.deepEqual(introFrom(FALLBACK_INTRO), FALLBACK_INTRO, 'as the toy plays it');
  for (const b of FALLBACK_INTRO.boxes) assert.ok(Array.from(b.text).length <= 120, `${b.id}: short`);
  // The admin's Start From the Toy’s Own is the same intro, every field in place.
  const { STARTERS } = await import('../admin/ui/schema.js');
  const start = STARTERS['invitation.intro']();
  assert.deepEqual(introFrom(start), FALLBACK_INTRO);
  assert.deepEqual(problems(start).errors, []);
  assert.deepEqual(problems(start).warnings, []);
  assert.notEqual(STARTERS['invitation.intro'](), STARTERS['invitation.intro'](), 'a copy each time');
});

test('readContent and introScript: content.json’s intro, a copy each time; broken, the toy’s own', () => {
  const inv = content().invitation;
  assert.ok(inv.intro, 'the key is there');
  assert.deepEqual(introScript(), introFrom(inv.intro));
  introScript().boxes[0].text = 'Changed.';
  assert.notEqual(introScript().boxes[0].text, 'Changed.', 'a copy each time');
  for (const raw of [undefined, null, 'x', {}, { intro: 3 }]) assert.deepEqual(readContent(raw).intro, FALLBACK_INTRO);
  assert.deepEqual(readContent({ intro: intro() }).intro, introFrom(intro()));
});

test('content.json’s intro passes the rules and is read without losing a box, a line or a choice', () => {
  const it = content().invitation.intro;
  const r = validateContent(content());
  assert.deepEqual(
    r.errors.filter((e) => e.path.startsWith('invitation.intro')),
    [],
  );
  const out = introFrom(it);
  assert.equal(out.speaker, it.speaker.trim());
  assert.equal(out.start, it.start);
  assert.deepEqual(
    out.boxes.map((b) => b.id),
    it.boxes.map((b) => b.id),
  );
  it.boxes.forEach((b, i) => {
    const o = out.boxes[i];
    for (const k of ['face', 'animation', 'camera']) assert.equal(o[k], b[k], `${b.id}: ${k}`);
    assert.equal(o.text, b.text.trim(), `${b.id}: its line`);
    assert.equal(o.speaker, b.speaker?.trim() || undefined, `${b.id}: its speaker`);
    assert.equal(o.auto, b.auto || undefined, `${b.id}: its wait`);
    assert.deepEqual(o.choices, b.choices?.length ? b.choices : undefined, `${b.id}: its choices`);
  });
});
