// The admin's intro preview, from the toy's side (/invitation/?preview, src/invitation/preview.js):
// framed by a stand-in admin page at an origin of its own, the toy says it's ready, plays the box
// a message names from the script it carries (the test's own, never the admin's content): its
// line typed out with its tags in the colours sent, the camera at the box's shot, NEWT in his talk
// state with the box's face; it says which box is playing and where Next goes, follows a reply to
// its box, and a restart plays the box again from the start. A message from another origin (a
// window of the site's own, opened from the admin page) is ignored, and so is everything when the
// address it's given isn't its framer's. In the real admin's Invitation page, typing in a box's
// text keeps the focus in the field while the preview plays the box again with each edit (the
// toy never pulls the focus into its frame). Every wait is on a state. (The stand-in admin page is a
// page of the real local admin server, playwright.config.mjs's, at its own origin: Chrome blocks a
// made-up public origin from framing a local server.)
import { test, expect } from '@playwright/test';

const ADMIN = process.env.PW_ADMIN_ORIGIN;
/** A box as the admin stores one (the test's own words). */
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
const script = {
  speaker: 'Previewer',
  start: 'a',
  boxes: [
    box('a', { text: 'The first line.', camera: 'wide' }),
    box('b', {
      text: 'A {tint|tinted} question?',
      face: 'smug',
      animation: 'Point',
      camera: 'close',
      choices: [
        { label: 'Yes', next: 'c' },
        { label: 'No', next: 'd' },
      ],
    }),
    box('c', { text: 'Then yes.', camera: 'medium', next: 'd' }),
    box('d', { text: 'All done.', face: 'happy', camera: 'wide', end: true }),
  ],
};
const TINT = '#2a9d4b';
const message = (o = {}) => ({
  type: 'invitation-intro-preview',
  script,
  palette: [{ name: 'tint', color: TINT }],
  box: 'b',
  viewport: 'desktop',
  ...o,
});

/**
 * A stand-in admin page: a page of the admin server with the toy framed in it (`admin`: the
 * address it's given), keeping what the toy says to it. (The admin's own app on #projects has no
 * frame of its own; the toy's is the page's first.)
 */
async function host(page, baseURL, { admin = ADMIN } = {}) {
  // (From a blank page, so a second call loads the admin afresh rather than only its hash.)
  await page.goto('about:blank');
  await page.goto(`${ADMIN}/#projects`);
  await expect(page.locator('.page-title')).toBeVisible();
  const src = `${baseURL}/invitation/?preview&test&seed=3&admin=${encodeURIComponent(admin)}`;
  await page.evaluate((url) => {
    window.said = [];
    addEventListener('message', (e) => window.said.push({ origin: e.origin, data: e.data }));
    const f = document.createElement('iframe');
    f.id = 'toy';
    f.src = url;
    f.width = '1280';
    f.height = '800';
    document.body.prepend(f);
  }, src);
  await expect.poll(() => Boolean(toyFrame(page)), { message: 'the toy’s frame', timeout: 30_000 }).toBe(true);
  const toy = toyFrame(page);
  await expect(toy.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  return toy;
}
const toyFrame = (page) => page.frames().find((f) => f.url().includes('/invitation/'));
const snapshot = (toy) => toy.evaluate(() => window.__invitation.snapshot());
const until = (toy, pred, what, timeout = 30_000) =>
  expect.poll(async () => pred(await snapshot(toy)), { message: what, timeout }).toBe(true);
/** What the toy has said to the stand-in admin page. */
const said = (page) => page.evaluate(() => window.said);
const post = (page, msg) => page.evaluate((m) => document.getElementById('toy').contentWindow.postMessage(m, '*'), msg);
/** The letters of the chat box's line that show. */
const shownLine = (toy) =>
  toy.evaluate(() =>
    [...document.querySelectorAll('.inv-talk-typed .inv-fx:not(.is-unseen)')].map((e) => e.textContent).join(''),
  );
const atShot = (s) =>
  s.dialogue && Math.abs(s.camera.distance - s.dialogue.goal.distance) < 0.02 * s.dialogue.goal.distance;

test('plays the box it’s sent: the line typed in its colours, its shot, his face; Next and a reply', async ({
  page,
  baseURL,
}) => {
  test.slow();
  const toy = await host(page, baseURL);
  // Calm, no envelope, no petals: and it says it's ready, to the admin's origin.
  const first = await snapshot(toy);
  expect(first.envelope).toBeNull();
  expect(first.options.calm).toBe(true);
  expect(first.preview.origin).toBe(ADMIN);
  await expect.poll(async () => (await said(page)).some((m) => m.data?.state === 'ready')).toBe(true);
  expect((await said(page)).every((m) => m.data?.type === 'invitation-intro-preview-state')).toBe(true);

  await post(page, message());
  await until(toy, (s) => s.dialogue?.id === 'b' && s.state === 'talk' && !s.dialogue.waiting, 'box b under way');
  await until(toy, (s) => s.dialogue.typed, 'its line typed');
  await expect.poll(() => shownLine(toy)).toBe('A tinted question?');
  const tinted = toy.locator('.inv-talk-typed .inv-fx', { hasText: 't' }).first();
  expect(await tinted.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(42, 157, 75)');
  await expect(toy.locator('.inv-talk-name')).toHaveText('Previewer');
  await until(toy, (s) => s.dialogue.shot === 'close' && atShot(s), 'the camera at its close shot');
  await until(toy, (s) => s.face === 'smug', 'his face');
  expect((await snapshot(toy)).talk.lastLine, 'no bubble line').toBeNull();
  // It holds there (Auto off), the replies up; it said which box and that Next has nowhere to go.
  const playing = (await said(page)).filter((m) => m.data.state === 'playing');
  expect(playing.at(-1).data).toMatchObject({ box: 'b', next: null, choices: true });
  expect((await snapshot(toy)).dialogue.auto).toBe(false);
  // A reply follows its box, and the toy says so (with c's Next).
  await until(toy, (s) => s.dialogue.repliesLive, 'the replies take a press');
  await toy.getByRole('button', { name: 'Yes', exact: true }).click();
  await until(toy, (s) => s.dialogue?.id === 'c', 'on to c');
  await expect
    .poll(async () => (await said(page)).filter((m) => m.data.state === 'playing').at(-1)?.data)
    .toMatchObject({ box: 'c', next: 'd', choices: false });
  // The admin's Next: the next box, as a message; then a restart plays a box from the start.
  await post(page, message({ box: 'd' }));
  await until(toy, (s) => s.dialogue?.id === 'd' && s.dialogue.typed && atShot(s), 'd, typed, at its shot');
  await expect.poll(() => shownLine(toy)).toBe('All done.');
  await post(page, message({ box: 'a', restart: true }));
  await until(toy, (s) => s.dialogue?.id === 'a' && s.dialogue.typed && s.dialogue.shot === 'wide', 'a again');
  await expect.poll(() => shownLine(toy)).toBe('The first line.');
  // A tap goes on, as in the intro.
  await toy.evaluate(() => document.querySelector('.inv-talk').click());
  await until(toy, (s) => s.dialogue?.id === 'b', 'a goes on to b');
});

test('a message from another origin is ignored; so is all of it when the address isn’t its framer’s', async ({
  page,
  baseURL,
}) => {
  test.slow();
  const toy = await host(page, baseURL);
  // (A window of the site's own, opened from the admin page, posts first; the admin after it.)
  const [other] = await Promise.all([
    page.waitForEvent('popup'),
    page.evaluate((url) => window.open(url), `${baseURL}/robots.txt`),
  ]);
  await other.waitForLoadState();
  await other.evaluate((m) => window.opener.frames[0].postMessage(m, '*'), message({ box: 'd' }));
  await post(page, message({ box: 'c' }));
  await until(toy, (s) => s.dialogue?.id === 'c' && s.dialogue.typed, 'the admin’s box');
  const boxes = (await said(page)).filter((m) => m.data.state === 'playing').map((m) => m.data.box);
  expect(boxes, 'never the other origin’s box').not.toContain('d');
  expect(boxes[0]).toBe('c');
  await other.close();

  // Given an address that isn't its framer's: it listens to nobody and says nothing.
  const lost = await host(page, baseURL, { admin: 'http://127.0.0.1:1' });
  expect((await snapshot(lost)).preview.origin).toBeNull();
  await post(page, message());
  const t0 = await lost.evaluate(() => window.__invitation.clock());
  await expect.poll(() => lost.evaluate(() => window.__invitation.clock())).toBeGreaterThan(t0 + 1);
  expect((await snapshot(lost)).dialogue).toBeNull();
  expect(await said(page)).toEqual([]);
});

test('typing in the admin’s Invitation page keeps the focus while the preview plays the box again', async ({
  page,
}) => {
  test.slow();
  await page.goto(`${ADMIN}/#invitation`);
  await expect(page.locator('.page-title')).toBeVisible();
  // (What the toy says to the admin page: each 'playing' is a box played again.)
  await page.evaluate(() => {
    window.played = 0;
    addEventListener('message', (e) => {
      if (e.data?.type === 'invitation-intro-preview-state' && e.data.state === 'playing') window.played += 1;
    });
  });
  const pane = page.locator('.intro-preview');
  await expect(pane.locator('.preview-state')).toHaveText('Ready', { timeout: 30_000 });
  await pane.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.played), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.locator('[data-path="invitation.intro.boxes[0]"] .card-toggle').first().click();
  const field = page.locator('[data-path="invitation.intro.boxes[0].text"] textarea');
  await field.click();
  await field.press('ControlOrMeta+A');
  let typed = '';
  for (const word of ['Focus', ' stays', ' in', ' the field.']) {
    const before = await page.evaluate(() => window.played);
    await page.keyboard.type(word);
    typed += word;
    // (The edit settles, the box plays again with it, and the field still has the focus.)
    await expect.poll(() => page.evaluate(() => window.played), { timeout: 30_000 }).toBeGreaterThan(before);
    await expect(field, `focus kept after “${typed}”`).toBeFocused();
  }
  await expect(field).toHaveValue(typed);
});
