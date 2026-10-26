// The invitation toy's intro preview (src/invitation/preview.js): /invitation/?preview inside the
// admin's frame plays one chat box of the admin's draft. Who may drive it (the framing page's own
// origin, as the browser reports it: location.ancestorOrigins, else the `admin` address the admin
// gives; never when it isn't framed), what it takes (every field of the message checked: its
// type, the script as content.js introScript() mends it, the box one of the script's, the text
// colours, the viewport, restart), the script it plays starting from that box, where Next goes
// from a box, and what it says back. The words are the test's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// (content.js reads `virtual:invitation-content`: here, an empty invitation.)
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec === 'virtual:invitation-content')
    return { url: 'data:text/javascript,' + encodeURIComponent('export default {}'), shortCircuit: true };
  return next(spec, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
const { PREVIEW_MESSAGE, PREVIEW_STATE, nextBox, previewOrigin, previewState, readPreview } =
  await import('../src/invitation/preview.js');
const { createDialogue } = await import('../src/invitation/dialogue.js');
const { parseQuery } = await import('../src/invitation/ui.js');

const ADMIN = 'https://admin.example.dev';
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
const script = () => ({
  speaker: 'Tester',
  start: 'a',
  boxes: [
    box('a', { text: 'First.' }),
    box('b', {
      text: '{red|Pick} one.',
      face: 'smug',
      animation: 'Point',
      camera: 'close',
      choices: [
        { label: 'Left', next: 'c' },
        { label: 'Right', next: 'd' },
      ],
    }),
    box('c', { text: 'Left.', next: 'e' }),
    box('d', { text: 'Right.' }),
    box('e', { text: 'The end.', camera: 'wide', end: true }),
  ],
});
const parent = { name: 'the admin' };
/** A message event as the frame gets one. */
const event = (data, o = {}) => ({ source: parent, origin: ADMIN, data, ...o });
const message = (o = {}) => ({
  type: PREVIEW_MESSAGE,
  script: script(),
  palette: [{ name: 'red', color: '#e44544' }],
  box: 'b',
  viewport: 'phone',
  ...o,
});
const read = (data, o) => readPreview(event(data, o), { parent, origin: ADMIN });

test('?preview is the preview mode, only in a frame; it has no envelope and stays calm', () => {
  const q = parseQuery(`?preview=1&admin=${encodeURIComponent(ADMIN)}`);
  assert.equal(q.preview, true);
  assert.equal(q.envelope, false, 'no envelope over the toy');
  assert.equal(q.calm, true, 'calm: no wandering');
  assert.equal(parseQuery('').preview, false);
  assert.equal(parseQuery('?test').envelope, false);
  assert.equal(parseQuery('').envelope, true, 'visitors still get the envelope');
});

test('the origin it listens to: the framing page’s own, never when it isn’t framed', () => {
  const search = `?preview&admin=${encodeURIComponent(ADMIN)}`;
  // (Chrome and Safari say who frames it: that's the origin, and the address must agree.)
  assert.equal(previewOrigin({ search, framed: true, ancestors: [ADMIN] }), ADMIN);
  assert.equal(previewOrigin({ search: '?preview', framed: true, ancestors: [ADMIN] }), ADMIN);
  assert.equal(
    previewOrigin({ search, framed: true, ancestors: ['https://elsewhere.example'] }),
    null,
    'an address that isn’t its framer’s: nothing',
  );
  // (Where the browser doesn't say, the admin's address.)
  assert.equal(previewOrigin({ search, framed: true, ancestors: null }), ADMIN);
  assert.equal(previewOrigin({ search: '?preview', framed: true, ancestors: null }), null, 'no origin known: nothing');
  assert.equal(previewOrigin({ search, framed: false, ancestors: null }), null, 'not in a frame: nothing');
  for (const bad of ['javascript:alert(1)', 'not a url', `${ADMIN}/path`, 'null', 'file:///x', ''])
    assert.equal(
      previewOrigin({ search: `?preview&admin=${encodeURIComponent(bad)}`, framed: true, ancestors: null }),
      null,
      `admin=${bad}`,
    );
  assert.equal(previewOrigin({ search: '?preview', framed: true, ancestors: ['null'] }), null, 'a sandboxed framer');
});

test('a message is taken only from its parent at that origin, of its own type', () => {
  assert.ok(read(message()), 'the admin’s');
  assert.equal(read(message(), { origin: 'https://elsewhere.example' }), null, 'another origin');
  assert.equal(read(message(), { source: { name: 'another frame' } }), null, 'another window, same origin');
  assert.equal(readPreview(event(message()), { parent, origin: null }), null, 'no origin to listen to');
  assert.equal(read({ ...message(), type: 'nh:effects' }), null, 'the site preview’s messages');
  for (const data of [null, 'text', 42, [], undefined]) assert.equal(read(data), null, `data ${JSON.stringify(data)}`);
});

test('every field is checked: the script, the box, the colours, the viewport, restart', () => {
  for (const s of [null, 'x', [], {}, { boxes: 'x' }, { boxes: [] }, { boxes: [{ text: 'no id' }] }, { boxes: [null] }])
    assert.equal(read(message({ script: s })), null, `script ${JSON.stringify(s)}`);
  assert.equal(
    read(message({ script: { boxes: Array.from({ length: 501 }, (_, i) => box(`b${i}`)) } })),
    null,
    'too big',
  );
  for (const b of [undefined, '', 'zz', 3, null, { id: 'b' }])
    assert.equal(read(message({ box: b })), null, `box ${b}`);
  assert.equal(read(message({ palette: 'red' })), null, 'colours that aren’t a list');
  assert.equal(read(message({ viewport: 'watch' })), null, 'a viewport it doesn’t have');
  const ok = read(message());
  assert.equal(ok.viewport, 'phone');
  assert.equal(ok.restart, false, 'restart off unless asked');
  assert.equal(read(message({ restart: true })).restart, true);
  assert.equal(read(message({ restart: 'yes' })).restart, false, 'only true restarts');
  assert.equal(read(message({ viewport: undefined })).viewport, 'desktop');
  // (The colours, as markup.js paletteOf reads them: a broken entry left out; none: the toy's own.)
  assert.equal(ok.palette.get('red'), '#e44544');
  const mended = read(
    message({
      palette: [
        { name: 'red', color: 'nope' },
        { name: 'gold', color: '#d4a017' },
      ],
    }),
  );
  assert.equal(mended.palette.has('red'), false);
  assert.equal(mended.palette.get('gold'), '#d4a017');
  assert.ok(read(message({ palette: undefined })).palette.size > 0, 'the toy’s own colours');
});

test('the script is mended as the toy mends the admin’s, and starts from the box', () => {
  const s = script();
  s.boxes[1].face = 'grumpy'; // (off the list: Neutral)
  s.boxes[2].next = 'gone'; // (to nowhere: the box after it)
  s.boxes.push(box('a', { text: 'A second a.' })); // (a doubled id: left out)
  const p = read(message({ script: s }));
  assert.equal(p.box, 'b');
  assert.equal(p.script.start, 'b', 'starts from the box');
  assert.equal(p.script.speaker, 'Tester');
  assert.deepEqual(
    p.script.boxes.map((b) => b.id),
    ['a', 'b', 'c', 'd', 'e'],
  );
  const b = p.script.boxes[1];
  assert.equal(b.face, 'neutral');
  assert.equal(b.text, '{red|Pick} one.', 'its tags kept: the screen draws them');
  assert.equal(b.camera, 'close');
  assert.equal(b.animation, 'Point');
  assert.equal(p.script.boxes[2].next, 'd');
  // (The runner opens on that box, with its choices once it's typed; a reply follows its box.)
  const d = createDialogue(p.script, { reduced: true });
  d.start(0);
  assert.equal(d.view.box.id, 'b');
  assert.deepEqual(
    d.step(0).choices.map((c) => c.next),
    ['c', 'd'],
  );
  d.choose(0, 1);
  assert.equal(d.view.box.id, 'c');
  // (The admin's own start doesn't matter: the box picked does.)
  assert.equal(read(message({ box: 'e', script: { ...script(), start: 'a' } })).script.start, 'e');
});

test('Next from a box: its own Next, else the box after it; none after choices or the end', () => {
  const p = read(message());
  assert.equal(nextBox(p.script, 'a'), 'b');
  assert.equal(nextBox(p.script, 'b'), null, 'choices: pick one');
  assert.equal(nextBox(p.script, 'c'), 'e');
  assert.equal(nextBox(p.script, 'd'), 'e');
  assert.equal(nextBox(p.script, 'e'), null, 'the end');
  assert.equal(nextBox(p.script, 'zz'), null);
  assert.equal(nextBox(null, 'a'), null);
});

test('what it says back: its own type, its state, and the box with where Next goes', () => {
  assert.deepEqual(previewState('ready'), { type: PREVIEW_STATE, state: 'ready' });
  assert.deepEqual(previewState('playing', { box: 'b', next: null, choices: true }), {
    type: PREVIEW_STATE,
    state: 'playing',
    box: 'b',
    next: null,
    choices: true,
  });
  assert.deepEqual(previewState('done'), { type: PREVIEW_STATE, state: 'done' });
  assert.notEqual(PREVIEW_STATE, PREVIEW_MESSAGE);
});
