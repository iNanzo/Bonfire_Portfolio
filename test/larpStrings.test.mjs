// The campfire game's words (src/larp/strings.js): every key written out in Vietnamese and
// English (NFC, no stray spaces, the same placeholders in both), English and Vietnamese labels
// in Title Case by the repo's titleCase() rule and hints as sentences; every phase, status,
// round, mode, scenery, emblem and error code has its words; the design's wording table is kept;
// t() in each language and display mode; points always signed (U+2212 for a deduction, never
// shown positive), zero as Recognition, '+25 Each', Team Points apart from Individual Points;
// thousands grouped; the clock rounded up and never negative; typed amounts parsed; names
// cleaned for storage and normalized for duplicate checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleCase } from '../src/text.js';
import {
  COMPLETION_STATUSES,
  DISPLAY_MODES,
  EMBLEMS,
  ERROR_CODES,
  EVENT_PHASES,
  ROUND_CATEGORIES,
  ROUND_PHASES,
  SCENERY_KEYS,
} from '../src/larp/types.js';
import {
  LANGS,
  MINUS,
  STRINGS,
  bilingual,
  cleanText,
  fill,
  formatClock,
  formatNumber,
  formatPoints,
  normalizeName,
  parsePoints,
  t,
} from '../src/larp/strings.js';

/** Key prefixes whose English is a sentence (a hint, message, checklist step or error). */
const SENTENCE_PREFIXES = ['hint.', 'check.', 'error.'];
const isSentence = (key) => SENTENCE_PREFIXES.some((p) => key.startsWith(p));
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
/** A template with its placeholders filled by a digit, so titleCase() sees real text. */
const filled = (s) => s.replace(/\{\w+\}/g, '0');
const keys = Object.keys(STRINGS);

test('the map is large and every key has both languages, written out', () => {
  assert.deepEqual([...LANGS], ['vi', 'en']);
  assert.ok(keys.length >= 150, `only ${keys.length} keys`);
  for (const key of keys) {
    const entry = STRINGS[key];
    assert.deepEqual(Object.keys(entry).sort(), ['en', 'vi'], key);
    for (const lang of LANGS) {
      const s = entry[lang];
      assert.equal(typeof s, 'string', `${key}.${lang}`);
      assert.ok(s.length > 0, `${key}.${lang} is empty`);
      assert.equal(s, s.normalize('NFC'), `${key}.${lang} is not NFC`);
      assert.equal(s, s.trim(), `${key}.${lang} has outer spaces`);
      assert.doesNotMatch(s, /\s{2}|[\t\n]/, `${key}.${lang} has a run of whitespace`);
      assert.doesNotMatch(s, /(^|[^\w])-\d/, `${key}.${lang} writes a minus as a hyphen`);
    }
    assert.notEqual(entry.vi, entry.en, `${key}: the Vietnamese is a copy of the English`);
    assert.deepEqual(placeholders(entry.vi), placeholders(entry.en), `${key}: placeholders differ`);
  }
});

test('Vietnamese is really Vietnamese: most strings carry its letters and marks', () => {
  const marked = keys.filter((k) => /[^\x20-\x7e]/.test(STRINGS[k].vi));
  assert.ok(marked.length / keys.length > 0.9, `only ${marked.length} of ${keys.length} have diacritics`);
  for (const key of keys) assert.doesNotMatch(STRINGS[key].en, /[ăâđêôơưĂÂĐÊÔƠƯ]/, `${key}.en has Vietnamese letters`);
});

test('labels are Title Case in both languages (the titleCase rule); hints are sentences', () => {
  let labels = 0;
  for (const key of keys) {
    const { vi, en } = STRINGS[key];
    if (isSentence(key)) {
      for (const s of [vi, en]) {
        assert.ok([...s].length <= 160, `${key}: a hint over 160 characters`);
        assert.doesNotMatch(s, /^\p{Ll}/u, `${key}: a sentence starts in lower case`);
      }
      if (key.startsWith('error.')) assert.match(en, /[.?]$/, `${key}: an error is a full sentence`);
      continue;
    }
    labels++;
    assert.equal(filled(en), titleCase(filled(en)), `${key}.en is not Title Case: "${en}"`);
    assert.equal(filled(vi), titleCase(filled(vi)), `${key}.vi is not Title Case: "${vi}"`);
  }
  assert.ok(labels >= 100);
  // A sentence written in Title Case by mistake would read as a label.
  assert.notEqual(t('hint.reviewing', 'en'), titleCase(t('hint.reviewing', 'en')));
});

test('every catalogue the contract defines has its words', () => {
  const need = [
    ...EVENT_PHASES.map((p) => `phase.${p}`),
    ...ROUND_PHASES.map((p) => `phase.${p}`),
    'phase.welcome',
    ...COMPLETION_STATUSES.map((s) => `status.${s}`),
    'status.unset',
    'status.skipped',
    ...DISPLAY_MODES.map((m) => `mode.${m}`),
    ...SCENERY_KEYS.map((s) => `scenery.${s}`),
    ...EMBLEMS.map((e) => `emblem.${e}`),
    ...ERROR_CODES.map((c) => `error.${c}`),
    ...ROUND_CATEGORIES.map((c) => `round.${c.key}`),
  ];
  for (const key of need) assert.ok(STRINGS[key], `missing ${key}`);
  // The rounds' words are the contract's own, not a second copy that could drift.
  for (const c of ROUND_CATEGORIES) {
    assert.equal(t(`round.${c.key}`, 'vi'), c.vi);
    assert.equal(t(`round.${c.key}`, 'en'), c.en);
  }
});

test('the buttons and labels the design names, in its words', () => {
  const en = {
    'action.publishReveal': 'Publish And Reveal',
    'action.reviewRound': 'Review Round',
    'action.reopenJudging': 'Reopen Judging',
    'action.judgeMode': 'Judge Mode',
    'action.done': 'Done',
    'action.add': 'Add',
    'action.saveTemplate': 'Save As Template',
    'action.exportBackup': 'Export Backup',
    'action.exportResults': 'Export Results',
    'action.deleteEventData': 'Delete Event Data',
    'action.startPreparation': 'Start Preparation',
    'action.endPreparation': 'End Preparation',
    'action.nextTeam': 'Next Team',
    'action.startNextRound': 'Start Next Round',
    'action.start': 'Start',
    'action.pause': 'Pause',
    'action.resume': 'Resume',
    'action.add30': 'Add 30 Seconds',
    'action.pauseReveal': 'Pause Reveal',
    'action.nextBanner': 'Next Banner',
    'action.skipToResults': 'Skip To Results',
    'action.skipRound': 'Skip Round',
    'action.endEvent': 'End Event',
    'action.import': 'Import',
    'action.resumeEvent': 'Resume Event',
    'action.openDisplay': 'Open Display Window',
    'action.previewDisplay': 'Preview Display',
    'action.testPattern': 'Show Test Pattern',
    'action.fullScreen': 'Full Screen',
    'tab.run': 'Run',
    'tab.roster': 'Teams & Roster',
    'tab.review': 'Review',
    'tab.history': 'History',
    'tab.setup': 'Setup',
    'role.host': 'Host',
    'role.coGm': 'Co-GM',
    'role.captain': 'Captain',
    'role.display': 'Display',
    'status.complete': 'Complete',
    'status.passed': 'Passed',
    'status.absent': 'Absent',
    'unit.teamPoints': 'Team Points',
    'unit.individualPoints': 'Individual Points',
    'unit.recognition': 'Recognition',
    'label.from': 'From',
    'label.privateNote': 'Private Note',
    'label.recipientType': 'Recipient Type',
  };
  for (const [key, want] of Object.entries(en)) assert.equal(t(key, 'en'), want, key);
  assert.equal(t('role.host', 'vi'), 'Quản Trò');
  assert.equal(t('role.captain', 'vi'), 'Đội Trưởng');
  assert.equal(t('phase.preparation', 'vi'), 'Chuẩn Bị');
  assert.equal(t('hint.reviewing', 'vi'), 'Ban Giám Khảo đang duyệt điểm');
  assert.equal(t('hint.reviewing', 'en'), 'HTs are reviewing');
});

test("the design's Vietnamese and English wording table, pair for pair", () => {
  const table = [
    ['tntt', 'Thiếu Nhi Thánh Thể', 'Eucharistic Youth Movement'],
    ['nghiaSi', 'Nghĩa Sĩ', 'Companion'],
    ['huynhTruong', 'Huynh Trưởng', 'Youth Leader'],
    ['doanSinh', 'Đoàn Sinh', 'Youth Member'],
    ['quanTro', 'Quản Trò', 'Game Leader'],
    ['judgingTeam', 'Ban Giám Khảo', 'Judging Team'],
    ['judgeMode', 'Chế Độ Giám Khảo', 'Judge Mode'],
    ['team', 'Đội', 'Team'],
    ['teamCaptain', 'Đội Trưởng', 'Team Captain'],
    ['roster', 'Danh Sách', 'Roster'],
    ['round', 'Vòng', 'Round'],
    ['preparation', 'Chuẩn Bị', 'Preparation'],
    ['time', 'Hết Giờ', 'Time'],
    ['points', 'Điểm', 'Points'],
    ['bonusPoints', 'Điểm Thưởng', 'Bonus Points'],
    ['deduction', 'Điểm Trừ', 'Point Deduction'],
    ['adjustment', 'Điều Chỉnh Điểm', 'Point Adjustment'],
    ['nameValue', 'Tên / Giá Trị', 'Name / Value'],
    ['reviewScores', 'Duyệt Điểm', 'Review Scores'],
    ['revealScores', 'Công Bố Điểm', 'Reveal Scores'],
    ['standings', 'Bảng Xếp Hạng', 'Standings'],
    ['creativity', 'Sáng Tạo', 'Creativity'],
    ['teamSpirit', 'Tinh Thần Đồng Đội', 'Team Spirit'],
    ['overTime', 'Quá Giờ', 'Over Time'],
  ];
  for (const [k, vi, en] of table) assert.deepEqual(STRINGS[`word.${k}`], { vi, en }, `word.${k}`);
  assert.equal(t('app.title', 'vi'), 'Lửa Trại Nghĩa Sĩ');
  assert.equal(t('app.title', 'en'), 'Nghĩa Sĩ Campfire');
});

test('t: each language, each display mode, and the key itself when missing', () => {
  assert.equal(t('word.time', 'vi'), 'Hết Giờ');
  assert.equal(t('word.time', 'en'), 'Time');
  assert.equal(t('word.time', 'bilingual'), 'Hết Giờ · Time');
  assert.equal(t('word.time', 'en-first'), 'Time · Hết Giờ');
  assert.equal(t('word.time', 'vi-only'), 'Hết Giờ');
  assert.equal(t('no.such.key', 'vi'), 'no.such.key');
  assert.equal(t('no.such.key', 'bilingual'), 'no.such.key');
  assert.equal(t('toString', 'en'), 'toString', 'inherited properties are not strings');
  assert.equal(t('__proto__', 'en'), '__proto__');
  assert.equal(t('word.time', /** @type {any} */ ('fr')), 'Time', 'an unknown language falls back to English');
  assert.equal(t('word.time', /** @type {any} */ (undefined)), 'Time');
  assert.equal(t(/** @type {any} */ (undefined), 'en'), '');
});

test('bilingual and fill: custom names and templates', () => {
  assert.equal(bilingual('Cùng Nhau Tỏa Sáng', 'Shine Together', 'bilingual'), 'Cùng Nhau Tỏa Sáng · Shine Together');
  assert.equal(bilingual('Cùng Nhau Tỏa Sáng', 'Shine Together', 'en-first'), 'Shine Together · Cùng Nhau Tỏa Sáng');
  assert.equal(bilingual('Cùng Nhau Tỏa Sáng', 'Shine Together', 'vi-only'), 'Cùng Nhau Tỏa Sáng');
  assert.equal(bilingual('Sáng Tạo', '', 'bilingual'), 'Sáng Tạo', 'no translation, no dangling dot');
  assert.equal(bilingual('', 'Creativity', 'vi-only'), 'Creativity', 'an empty side falls back to the other');
  assert.equal(bilingual('Same', 'Same', 'bilingual'), 'Same');
  assert.equal(bilingual('Đội', 'Team', 'en'), 'Team');
  assert.equal(bilingual('Đội', 'Team', 'vi'), 'Đội');

  assert.equal(fill('{n} teams need a status.', { n: 2 }), '2 teams need a status.');
  assert.equal(fill('{a} and {a} {b}', { a: 'x', b: 0 }), 'x and x 0', 'every occurrence, zero included');
  assert.equal(fill('{missing} stays', {}), '{missing} stays');
  assert.equal(fill(t('action.publishRevealRound', 'en'), { n: 4 }), 'Publish And Reveal Round 4');
  assert.equal(
    fill(t('action.addPoints', 'en'), { points: formatPoints(-25) }),
    `Add ${MINUS}25`,
    'the Add button repeats the signed value (U05)',
  );
  assert.equal(
    fill(t('action.addEach', 'en'), { points: formatPoints(25, { each: true }), n: 3 }),
    'Add +25 Each · 3 People',
  );
  assert.equal(fill(t('hint.needStatusMany', 'en'), { n: 2 }), '2 teams need a status.');
  assert.equal(
    fill(t('hint.estimateOver', 'en'), { total: formatClock(56 * 60_000), over: '6:00', target: '50:00' }),
    'Estimated 56:00 · 6:00 over the 50:00 target',
  );
});

test('formatPoints: signed, with Team Points apart from Individual Points, both languages', () => {
  assert.equal(MINUS, '−');
  assert.equal(formatPoints(75, { unit: 'team' }), '+75 Team Points');
  assert.equal(formatPoints(-25, { unit: 'team' }), `${MINUS}25 Team Points`);
  assert.equal(formatPoints(-25, { unit: 'individual' }), `${MINUS}25 Individual Points`);
  assert.equal(formatPoints(25, { unit: 'individual' }), '+25 Individual Points');
  assert.equal(formatPoints(50), '+50', 'plain by default');
  assert.equal(formatPoints(-50, { unit: 'plain' }), `${MINUS}50`);
  assert.equal(formatPoints(1400, { unit: 'team' }), '+1,400 Team Points');
  assert.equal(formatPoints(75, { unit: 'team', lang: 'vi' }), '+75 Điểm Đội');
  assert.equal(formatPoints(-25, { unit: 'individual', lang: 'vi' }), `${MINUS}25 Điểm Cá Nhân`);
  assert.equal(formatPoints(1400, { lang: 'vi' }), '+1.400');
  assert.notEqual(t('unit.teamPoints', 'en'), t('unit.individualPoints', 'en'));
  assert.notEqual(t('unit.teamPoints', 'vi'), t('unit.individualPoints', 'vi'));
});

test("formatPoints: '+25 Each' for several recipients", () => {
  assert.equal(formatPoints(25, { each: true }), '+25 Each');
  assert.equal(formatPoints(-10, { each: true }), `${MINUS}10 Each`);
  assert.equal(formatPoints(25, { unit: 'individual', each: true }), '+25 Individual Points Each');
  assert.equal(formatPoints(25, { unit: 'team', each: true }), '+25 Team Points Each');
  assert.equal(formatPoints(25, { each: true, lang: 'vi' }), '+25 Mỗi Bên');
  assert.equal(formatPoints(25, { unit: 'individual', each: true, lang: 'vi' }), '+25 Điểm Cá Nhân Mỗi Người');
  assert.equal(formatPoints(25, { unit: 'team', each: true, lang: 'vi' }), '+25 Điểm Đội Mỗi Đội');
});

test('formatPoints: zero is Recognition, never signed', () => {
  assert.equal(formatPoints(0, { unit: 'team' }), 'Recognition · 0 Points');
  assert.equal(formatPoints(0, { unit: 'individual' }), 'Recognition · 0 Points');
  assert.equal(formatPoints(0, { unit: 'individual', lang: 'vi' }), 'Ghi Nhận · 0 Điểm');
  assert.equal(formatPoints(0, { unit: 'individual', each: true }), 'Recognition · 0 Points Each');
  assert.equal(formatPoints(0), '0');
  assert.equal(formatPoints(-0, { unit: 'team' }), 'Recognition · 0 Points', 'negative zero is zero');
  assert.equal(formatPoints(0, { each: true }), '0 Each');
  for (const s of [formatPoints(0), formatPoints(-0), formatPoints(0, { unit: 'team' })]) {
    assert.doesNotMatch(s, /[+−-]/);
  }
});

test('a deduction is never shown as positive, and the text reads back as the amount', () => {
  const values = [1, 2, 9, 10, 25, 99, 100, 999, 1000, 1001, 123456, 10 ** 9, Number.MAX_SAFE_INTEGER];
  for (const v of values) {
    for (const unit of /** @type {const} */ (['team', 'individual', 'plain'])) {
      for (const lang of LANGS) {
        for (const each of [false, true]) {
          const neg = formatPoints(-v, { unit, lang, each });
          const pos = formatPoints(v, { unit, lang, each });
          assert.ok(neg.startsWith(MINUS), neg);
          assert.ok(!neg.includes('+') && !neg.includes('-'), neg);
          assert.ok(pos.startsWith('+') && !pos.includes(MINUS), pos);
          const digits = (s) => s.split(' ')[0].replace(/[.,]/g, '');
          assert.equal(parsePoints(digits(neg)), -v);
          assert.equal(parsePoints(digits(pos)), v);
        }
      }
    }
  }
  assert.ok(formatPoints(-0.6).startsWith(MINUS), 'a fraction that rounds to a deduction stays one');
  assert.equal(formatPoints(Number.NaN), '0', 'not a number shows nothing signed');
});

test('formatNumber: grouped per language, U+2212 for negatives, no forced plus', () => {
  assert.equal(formatNumber(1040), '1,040');
  assert.equal(formatNumber(1040, 'vi'), '1.040');
  assert.equal(formatNumber(985), '985');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(-25), `${MINUS}25`);
  assert.equal(formatNumber(-1234567), `${MINUS}1,234,567`);
  assert.equal(formatNumber(-1234567, 'vi'), `${MINUS}1.234.567`);
  assert.equal(formatNumber(Number.MAX_SAFE_INTEGER), '9,007,199,254,740,991');
  assert.equal(formatNumber(100000), '100,000');
  assert.equal(formatNumber(Number.POSITIVE_INFINITY), '0');
});

test('formatClock: m:ss, rounded up to the second, never negative', () => {
  assert.equal(formatClock(72_000), '1:12');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(1), '0:01', 'shows 0:01 until it really ends');
  assert.equal(formatClock(999), '0:01');
  assert.equal(formatClock(1000), '0:01');
  assert.equal(formatClock(1001), '0:02');
  assert.equal(formatClock(59_001), '1:00');
  assert.equal(formatClock(62 * 60_000), '62:00', 'minutes are unbounded');
  assert.equal(formatClock(125 * 60_000 + 5000), '125:05');
  assert.equal(formatClock(-5000), '0:00');
  assert.equal(formatClock(Number.NaN), '0:00');
  assert.equal(formatClock(Number.POSITIVE_INFINITY), '0:00');
  assert.equal(formatClock(/** @type {any} */ ('90')), '0:00');
});

test('parsePoints: +, - and U+2212; whole safe numbers only', () => {
  assert.equal(parsePoints('+50'), 50);
  assert.equal(parsePoints('50'), 50);
  assert.equal(parsePoints('-25'), -25);
  assert.equal(parsePoints('−25'), -25);
  assert.equal(parsePoints('  -25  '), -25);
  assert.equal(parsePoints('0'), 0);
  assert.ok(Object.is(parsePoints('-0'), 0), 'never negative zero');
  assert.equal(parsePoints('007'), 7);
  assert.equal(parsePoints(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  assert.equal(parsePoints(`-${Number.MAX_SAFE_INTEGER}`), -Number.MAX_SAFE_INTEGER);
  for (const bad of [
    '',
    '   ',
    '+',
    '-',
    '1.5',
    '1,000',
    '1e3',
    '0x10',
    'NaN',
    'Infinity',
    '--5',
    '+-5',
    '5-',
    '5 0',
    'abc',
    '９',
    String(Number.MAX_SAFE_INTEGER + 2),
  ]) {
    assert.equal(parsePoints(bad), null, JSON.stringify(bad));
  }
  assert.equal(parsePoints(/** @type {any} */ (25)), null, 'not text');
  assert.equal(parsePoints(/** @type {any} */ (null)), null);
});

test('cleanText: what is stored, NFC, trimmed and collapsed', () => {
  const decomposed = 'Sáng Tạo';
  assert.equal(cleanText(`  ${decomposed}\t \n `), 'Sáng Tạo');
  assert.equal(cleanText('Sáng Tạo'), cleanText(decomposed));
  assert.equal(cleanText('Đội   Phaolô'), 'Đội Phaolô');
  assert.equal(cleanText('<b>Anh B.</b>'), '<b>Anh B.</b>', 'plain text, escaped later where it is shown');
  assert.equal(cleanText(undefined), '');
  assert.equal(cleanText(42), '');
  assert.equal(cleanText(null), '');
});

test('normalizeName: the fixed duplicate rule', () => {
  assert.equal(normalizeName('Sáng  Tạo '), 'sang tao');
  assert.equal(normalizeName('sang tao'), 'sang tao');
  assert.equal(normalizeName('SÁNG TẠO'), 'sang tao');
  assert.equal(normalizeName('Sáng Tạo'), 'sang tao', 'decomposed input matches');
  assert.equal(normalizeName('Đội Đồng Đức'), 'doi dong duc', 'đ and Đ become d');
  assert.equal(normalizeName('  Tinh   Thần\tĐồng Đội\n'), 'tinh than dong doi');
  assert.equal(normalizeName('Quá Giờ'), normalizeName('QUA GIO'));
  assert.notEqual(normalizeName('Sáng Tạo'), normalizeName('Sáng Tạo 2'));
  assert.equal(normalizeName('Crème Brûlée'), 'creme brulee');
  assert.equal(normalizeName(undefined), '');
  assert.equal(normalizeName(7), '');
  for (const key of keys) {
    const n = normalizeName(STRINGS[key].vi);
    assert.doesNotMatch(n, /[̀-ͯ]|[A-ZĐđ]/u, key);
  }
});
