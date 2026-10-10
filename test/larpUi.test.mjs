// The campfire screens' shared render helpers (src/larp/ui.js, emblems.js) and the host window's
// local UI state (uiState.js): markup is a string with every text escaped (A22), the attributes the
// DOM layer delegates on (data-action, data-change, data-draft), signed amounts that read
// "Add −25" whichever way the minus was entered (U05), signs and the word Points on every amount
// (U03), team chips with emblems so color is never alone, the face picked per whole string (U01),
// clocks the tick can refresh, and UI state that survives a reload without ever being the event.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addLabel,
  attrs,
  bilingualLines,
  button,
  checkbox,
  clockText,
  countdown,
  elapsed,
  emblem,
  errorText,
  faceText,
  field,
  label,
  points,
  segmented,
  selectInput,
  signOf,
  signedPointsInput,
  teamChip,
  textArea,
  textInput,
  withSign,
} from '../src/larp/ui.js';
import { EMBLEM_PIXELS, emblemSvg } from '../src/larp/emblems.js';
import { EMBLEMS } from '../src/larp/types.js';
import { MINUS } from '../src/larp/strings.js';
import {
  JUDGE_LOCK_KEY,
  UI_KEY,
  createUiStore,
  defaultUi,
  judgeLockPatch,
  judgeLockText,
  readUi,
} from '../src/larp/uiState.js';
import { enterSubmits } from '../src/larp/dom.js';
import { fakeStorage } from './lib/larpFixtures.mjs';

const EVIL = '<img src=x onerror="alert(1)">&\'';

test('buttons carry their action and value; aria-disabled keeps them focusable with a reason', () => {
  const html = button('Next Team: Đội Giuse', 'next', {
    variant: 'primary',
    value: 7,
    hint: 'Why it is off.',
    disabled: true,
    kbd: 'N',
    focus: 'next',
  });
  assert.match(html, /^<button type="button" class="larp-btn larp-btn-primary"/);
  assert.match(html, /data-action="next"/);
  assert.match(html, /data-value="7"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /data-tip="Why it is off\."/);
  assert.match(html, /data-focus="next"/);
  assert.match(html, /<kbd class="larp-kbd">N<\/kbd>/);
  assert.match(html, />Next Team: Đội Giuse</);
  assert.doesNotMatch(html, / disabled[ >]/, 'never the disabled attribute');
  const plain = button('Add', 'run.add');
  assert.match(plain, /larp-btn-secondary/);
  assert.doesNotMatch(plain, /aria-pressed|data-value|aria-disabled/);
  assert.match(button('Team', 'seg', { pressed: false }), /aria-pressed="false"/);
});

test('every text and attribute is escaped (A22)', () => {
  for (const html of [
    button(EVIL, EVIL, { value: EVIL, hint: EVIL }),
    field({ id: 'f', label: EVIL, control: '', hint: EVIL, error: EVIL }),
    textInput({ id: 'i', value: EVIL, placeholder: EVIL }),
    textArea({ id: 'a', value: EVIL }),
    selectInput({ id: 's', options: [{ value: EVIL, label: EVIL }], value: EVIL }),
    checkbox({ id: 'c', label: EVIL, hint: EVIL }),
    faceText(EVIL),
    teamChip({ id: EVIL, name: EVIL, translation: EVIL, color: EVIL, emblem: EVIL }, { sub: true }),
    bilingualLines(EVIL, EVIL + '2', 'bilingual'),
    emblem(EVIL, { label: EVIL, color: EVIL }),
  ]) {
    assert.doesNotMatch(html, /<img|onerror="/, html);
  }
  assert.equal(attrs({ a: 'x"y', b: true, c: false, d: null, e: undefined, f: 0 }), ' a="x&quot;y" b f="0"');
});

test('fields: labels tied to controls, drafts, live inputs, hints and errors described', () => {
  const input = textInput({
    id: 'award-name',
    draft: 'award.name',
    value: 'Sáng Tạo',
    maxLength: 60,
    required: true,
    hint: true,
    error: true,
    live: true,
  });
  assert.match(input, /data-draft="award\.name"/);
  assert.match(input, /value="Sáng Tạo"/);
  assert.match(input, /maxlength="60"/);
  assert.match(input, / required/);
  assert.match(input, / data-live/);
  assert.match(input, /aria-invalid="true"/);
  assert.match(input, /aria-describedby="award-name-hint award-name-error"/);
  const f = field({ id: 'award-name', label: 'Name', control: input, hint: 'A short name.', error: 'Enter a name.' });
  assert.match(f, /<label class="larp-label" for="award-name">Name<\/label>/);
  assert.match(f, /id="award-name-hint"/);
  assert.match(f, /role="alert"/);
  assert.doesNotMatch(textInput({ id: 'x' }), /aria-describedby|data-live|required/);
  const sel = selectInput({
    id: 'to',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
    ],
    value: 'b',
    action: 'run.to',
    draft: 'award.to',
  });
  assert.match(sel, /<option value="b" selected disabled>B<\/option>/);
  assert.match(sel, /data-change="run\.to"/);
  assert.match(
    textArea({ id: 'names', rows: 6, draft: 'roster.names', value: 'Mai\nAn' }),
    /rows="6"[^>]*>Mai\nAn<\/textarea>/,
  );
  const box = checkbox({ id: 'rm', label: 'Reduced Motion', checked: true, action: 'setup.reducedMotion' });
  assert.match(box, /type="checkbox"[^>]* checked/);
  assert.match(box, /data-change="setup\.reducedMotion"/);
  const seg = segmented({
    label: 'Recipient Type',
    action: 'run.kind',
    value: 'member',
    options: [
      { value: 'team', label: 'Team' },
      { value: 'member', label: 'Individual' },
    ],
  });
  assert.match(seg, /role="group" aria-label="Recipient Type"/);
  assert.match(seg, /data-value="member" aria-pressed="true"/);
  assert.match(seg, /data-value="team" aria-pressed="false"/);
});

test('signed amounts: the toggles and typed - or − all give −25 and "Add −25" (U05)', () => {
  assert.equal(withSign('25', '-'), `${MINUS}25`);
  assert.equal(withSign(`${MINUS}25`, '+'), '25');
  assert.equal(withSign('-25', '+'), '25');
  assert.equal(withSign('+25', '-'), `${MINUS}25`);
  assert.equal(withSign('', '-'), MINUS);
  assert.equal(withSign(undefined, MINUS), MINUS);
  assert.equal(signOf('-25'), '-');
  assert.equal(signOf(`${MINUS}25`), '-');
  assert.equal(signOf('25'), '+');
  assert.equal(signOf(null), '+');
  for (const typed of ['-25', `${MINUS}25`, withSign('25', '-')]) {
    assert.equal(addLabel({ points: typed, lang: 'en' }), `Add ${MINUS}25`);
  }
  assert.equal(addLabel({ points: '25', lang: 'en' }), 'Add +25');
  assert.equal(addLabel({ points: 25, count: 3, lang: 'en' }), 'Add +25 Each · 3 People');
  assert.equal(addLabel({ points: -25, lang: 'vi' }), `Thêm ${MINUS}25`);
  assert.equal(addLabel({ points: '2.5', lang: 'en' }), 'Add');
  assert.equal(addLabel({ points: null, lang: 'en' }), 'Add');
  assert.equal(addLabel({ points: 1.5, lang: 'en' }), 'Add');
  const html = signedPointsInput({ id: 'pts', draft: 'award.points', value: `${MINUS}25`, label: 'Points' });
  assert.match(html, /data-action="sign" data-value="-" data-draft-target="award\.points" aria-pressed="true"/);
  assert.match(html, /data-value="\+" data-draft-target="award\.points" aria-pressed="false"/);
  assert.match(html, /data-draft="award\.points" data-live/);
  assert.match(html, /aria-controls="pts"/);
  assert.match(
    signedPointsInput({ id: 'p', draft: 'a.p', label: 'Points' }),
    /data-value="\+"[^>]*aria-pressed="true"/,
  );
});

test('amounts always show their sign and unit, so meaning never rests on color (U03)', () => {
  assert.equal(points(-25, { unit: 'team' }), `<span class="larp-pts larp-pts-minus">${MINUS}25 Team Points</span>`);
  assert.match(points(75, { unit: 'individual', cls: 'big' }), /larp-pts-plus big">\+75 Individual Points</);
  assert.match(points(0, { unit: 'team' }), /larp-pts-zero">Recognition · 0 Points</);
  assert.match(points(25, { each: true, lang: 'vi' }), /\+25 Mỗi Bên/);
});

test('emblems: every key draws pixels, decorative unless named; team chips pair the emblem with the name', () => {
  for (const key of EMBLEMS) {
    const rows = EMBLEM_PIXELS[key];
    assert.ok(
      rows.every((r) => r.length === 9 && /^[#.]+$/.test(r)),
      key,
    );
    const svg = emblemSvg(key, { size: 27 });
    assert.match(svg, new RegExp(`data-emblem="${key}" viewBox="0 0 9 ${rows.length}"`));
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /fill="currentColor" d="M\d/);
  }
  assert.match(emblemSvg('nope'), /data-emblem="nope" viewBox="0 0 9 9"/, 'falls back to the first shape');
  assert.match(
    emblem('star', { label: 'Star', color: '#e8b04a' }),
    /^<span class="larp-emblem-wrap" style="color:#e8b04a"><svg[^>]*role="img" aria-label="Star"/,
  );
  assert.doesNotMatch(
    emblem('star', { color: 'red; background:url(x)' }),
    /style=/,
    'only #rrggbb colors reach a style',
  );
  const chip = teamChip(
    { id: 'team-1', name: 'Đội Phaolô', translation: 'Team Paul', color: '#5fa8d3', emblem: 'shield' },
    { sub: true },
  );
  assert.match(chip, /data-team="team-1" style="--team:#5fa8d3"/);
  assert.match(chip, /data-emblem="shield"/);
  assert.match(chip, /class="larp-face-inter larp-chip-name">Đội Phaolô</, 'the Vietnamese name falls back whole');
  assert.match(chip, /class="larp-face-cinzel larp-chip-sub" lang="en">Team Paul</);
  assert.doesNotMatch(teamChip({ name: 'X', translation: 'Y', color: 'bad', emblem: 'star' }), /style=|Y</);
});

test('faces per whole string and the two languages as main and sub lines (U01)', () => {
  assert.equal(faceText('Phaolô'), '<span class="larp-face-cinzel">Phaolô</span>');
  assert.equal(
    faceText('Lửa Trại', 'cinzel', { tag: 'h1', cls: 'title', lang: 'vi' }),
    '<h1 class="larp-face-inter title" lang="vi">Lửa Trại</h1>',
  );
  assert.match(faceText('x', 'pixelify', { tag: 'h1 onclick' }), /^<span /, 'only a plain tag name');
  const both = bilingualLines('Vũ Điệu', 'Dance', 'bilingual');
  assert.match(
    both,
    /larp-face-inter larp-bi-main" lang="vi">Vũ Điệu<.*larp-face-cinzel larp-bi-sub" lang="en">Dance</,
  );
  const en = bilingualLines('Vũ Điệu', 'Dance', 'en-first');
  assert.match(en, /larp-bi-main" lang="en">Dance<.*larp-bi-sub" lang="vi">Vũ Điệu</);
  assert.doesNotMatch(bilingualLines('Vũ Điệu', 'Dance', 'vi-only'), /Dance/);
  assert.doesNotMatch(bilingualLines('Same', 'Same', 'bilingual'), /larp-bi-sub/);
  assert.match(bilingualLines('', 'Dance', 'bilingual'), /lang="en">Dance</);
  assert.match(bilingualLines('Vũ Điệu', 'Dance', 'en', { face: 'pixelify', cls: 'x' }), /class="larp-bi x"/);
});

test('clocks render now and refresh from their data attributes', () => {
  const now = 1_000_000;
  const running = { kind: 'turn', status: 'running', durationMs: 90_000, deadline: now + 72_000, remainingMs: null };
  const html = countdown(running, now);
  assert.match(html, /data-clock="countdown" data-status="running" data-deadline="1072000">1:12</);
  assert.equal(
    clockText({ clock: 'countdown', status: 'running', deadline: String(now + 72_000) }, now + 2000),
    '1:10',
  );
  const paused = { kind: 'turn', status: 'paused', durationMs: 90_000, deadline: null, remainingMs: 30_000 };
  assert.match(countdown(paused, now, { cls: 'big' }), /class="larp-clock big"[^>]*data-remaining="30000">0:30</);
  assert.equal(clockText({ clock: 'countdown', status: 'paused', remaining: '30000' }, now + 99_999), '0:30');
  assert.match(
    countdown({ kind: null, status: 'idle', durationMs: 0, deadline: null, remainingMs: null }, now),
    /data-remaining="0">0:00</,
  );
  assert.equal(clockText({}, now), '0:00');
  assert.match(elapsed(now - 61_500, now), /data-clock="elapsed" data-since="938500">1:01</);
  assert.match(elapsed(null, now), /data-clock="elapsed">0:00</);
  assert.equal(clockText({ clock: 'elapsed', since: String(now - 1_880_000) }, now), '31:20');
  assert.equal(clockText({ clock: 'elapsed' }, now), '0:00');
});

test('labels and errors come from strings.js in the host language', () => {
  assert.equal(label('action.startRoundN', 'en', { n: 2 }), 'Start Round 2');
  assert.equal(label('tab.run', 'vi'), 'Điều Khiển');
  assert.equal(errorText({ code: 'no_teams', message: '' }, 'en'), 'Add at least one team to start.');
  assert.equal(errorText(null, 'en'), '');
});

test('every button keeps a focus key through a re-render; the sign toggles are named in the host language', () => {
  assert.match(button('Pause', 'timer.toggle'), /data-focus="timer.toggle"/, 'its action');
  assert.match(button('Edit', 'run.edit', { value: 'a-1' }), /data-focus="run.edit:a-1"/, 'action and value');
  assert.match(button('Next', 'next', { focus: 'next' }), /data-focus="next"/, 'its own key wins');
  const vi = signedPointsInput({ id: 'p', draft: 'f.p', label: 'Điểm', lang: 'vi' });
  assert.match(vi, /aria-label="Dấu Trừ"/);
  assert.match(vi, /aria-label="Dấu Cộng"/);
  const en = signedPointsInput({ id: 'p', draft: 'f.p', label: 'Points' });
  assert.match(en, /aria-label="Minus"/);
  assert.match(en, /aria-label="Plus"/);
});

test('UI state: defaults, a reload keeps choices and drafts, never confirmations; bad copies are ignored', () => {
  const storage = fakeStorage();
  const ui = createUiStore({ storage });
  assert.deepEqual(ui.get(), defaultUi());
  let renders = 0;
  const off = ui.subscribe(() => renders++);
  ui.set({ tab: 'setup', preview: true, recipientIds: ['team-1'], recipientType: 'member' });
  ui.set((s) => ({ judge: { ...s.judge, open: true, gmId: 'gm-1' } }));
  ui.setDraft('award', 'name', 'Sáng Tạo');
  assert.equal(renders, 2, 'typing is silent');
  ui.setDraft('award', 'points', '-25', { silent: false });
  assert.equal(renders, 3, 'a live field re-renders');
  ui.setLocal('run', { showAll: true });
  ui.set({
    confirm: { action: 'next', hintKey: 'hint.confirmPublish', labelKey: 'action.publishReveal' },
    flash: { kind: 'error', key: 'error.no_teams' },
  });
  assert.deepEqual(ui.draft('award'), { name: 'Sáng Tạo', points: '-25' });
  assert.deepEqual(ui.draft('none'), {});
  const again = createUiStore({ storage }).get();
  assert.equal(again.tab, 'setup');
  assert.equal(again.preview, true);
  assert.deepEqual(again.judge, { open: true, gmId: 'gm-1', lastGmId: null });
  assert.deepEqual(again.recipientIds, ['team-1']);
  assert.equal(again.recipientType, 'member');
  assert.deepEqual(again.drafts.award, { name: 'Sáng Tạo', points: '-25' });
  assert.deepEqual(again.local.run, { showAll: true });
  assert.equal(again.confirm, null);
  assert.equal(again.flash, null);
  ui.clearDraft('award');
  assert.equal(ui.get().drafts.award, undefined);
  off();
  ui.set({ tab: 'run' });
  assert.equal(renders, 6);
  assert.ok(storage.map.has(UI_KEY));
  assert.ok(UI_KEY.startsWith('larp.ui.'));

  assert.deepEqual(readUi('{not json'), defaultUi());
  assert.deepEqual(readUi('[1,2]'), defaultUi());
  assert.deepEqual(readUi(null), defaultUi());
  const odd = readUi(
    JSON.stringify({
      tab: 'admin',
      judge: { open: 'yes', gmId: 5 },
      recipientType: 'all',
      recipientIds: ['a', 3],
      drafts: { a: { x: 'y', n: 2 }, b: 'z', c: { n: 1 } },
      local: { run: 1, setup: { a: 1 } },
      preview: 'true',
    }),
  );
  assert.equal(odd.tab, 'run');
  assert.deepEqual(odd.judge, { open: false, gmId: null, lastGmId: null });
  assert.equal(odd.recipientType, 'team');
  assert.deepEqual(odd.recipientIds, ['a']);
  assert.deepEqual(odd.drafts, { a: { x: 'y' } });
  assert.deepEqual(odd.local, { setup: { a: 1 } });
  assert.equal(odd.preview, false);
});

test('UI state with no storage, or a storage that throws, still works in memory', () => {
  const none = createUiStore();
  none.set({ tab: 'history' });
  assert.equal(none.get().tab, 'history');
  const broken = createUiStore({ storage: fakeStorage({ failReads: true, failFrom: 1 }) });
  broken.setDraft('a', 'b', 'c');
  assert.equal(broken.draft('a').b, 'c');
});

test('Enter submits the form around a one-line field, never while an input method composes', () => {
  const input = (type = 'text') => ({ tagName: 'INPUT', type });
  assert.equal(enterSubmits({ key: 'Enter' }, input()), true, 'Name, Translation, Points');
  assert.equal(enterSubmits({ key: 'Enter' }, input('password')), true, 'the Host PIN');
  assert.equal(enterSubmits({ key: 'Enter', isComposing: true }, input()), false, 'Telex picking characters');
  assert.equal(enterSubmits({ key: 'Enter', shiftKey: true }, input()), false);
  assert.equal(enterSubmits({ key: 'Enter', ctrlKey: true }, input()), false);
  assert.equal(enterSubmits({ key: 'Enter' }, input('search')), false, 'Find Recipient filters');
  assert.equal(enterSubmits({ key: 'Enter' }, input('checkbox')), false);
  assert.equal(enterSubmits({ key: 'Enter' }, { tagName: 'TEXTAREA' }), false);
  assert.equal(enterSubmits({ key: 'Enter' }, { tagName: 'BUTTON' }), false, 'a button works Enter itself');
  assert.equal(enterSubmits({ key: 'a' }, input()), false);
  assert.equal(enterSubmits({ key: 'Enter' }, null), false);
});

test("Judge Mode's lock is kept for every host window while a Host PIN is set", () => {
  assert.equal(JUDGE_LOCK_KEY.startsWith('larp.'), true, "under the game's own prefix");
  const event = { id: 'e1', config: { hostPin: '4321' }, gms: [{ id: 'gm-b' }] };
  const open = { ...defaultUi(), judge: { open: true, gmId: 'gm-b', lastGmId: 'gm-b' } };
  const text = judgeLockText(open, event);
  assert.deepEqual(JSON.parse(text), { eventId: 'e1', gmId: 'gm-b' });
  assert.equal(judgeLockText(defaultUi(), event), null, 'Judge Mode closed: no lock');
  assert.equal(judgeLockText(open, { ...event, config: { hostPin: null } }), null, 'no PIN: no lock');
  assert.equal(judgeLockText(open, { ...event, config: { hostPin: '  ' } }), null);
  assert.equal(judgeLockText(open, null), null);

  // A new tab, a reopened one, or Take Over: back into Judge Mode as the same co-GM.
  assert.deepEqual(judgeLockPatch(defaultUi(), text, event), { judge: { open: true, gmId: 'gm-b', lastGmId: 'gm-b' } });
  const gone = judgeLockText({ ...open, judge: { open: true, gmId: 'gm-x', lastGmId: null } }, event);
  assert.deepEqual(judgeLockPatch(defaultUi(), gone, event), { judge: { open: true, gmId: null, lastGmId: null } });
  assert.equal(judgeLockPatch(open, text, event), null, 'already in Judge Mode');
  assert.equal(judgeLockPatch(defaultUi(), text, { ...event, id: 'e2' }), null, "another event's lock");
  assert.equal(judgeLockPatch(defaultUi(), text, { ...event, config: { hostPin: null } }), null);
  assert.equal(judgeLockPatch(defaultUi(), null, event), null);
  assert.equal(judgeLockPatch(defaultUi(), '{oops', event), null);
  assert.equal(judgeLockPatch(defaultUi(), '[1]', event), null);
});
