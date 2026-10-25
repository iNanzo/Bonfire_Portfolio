// Text effects in the invitation toy's lines (the intro's chat boxes and NEWT's bubble lines,
// content.json `invitation.intro` and `invitation.lines`), read the same way by the toy, the
// content rules (src/contentRules.js) and the admin's preview. A tag is {styles|text}: styles,
// split by commas, are a colour (a name from the palette, `invitation.text.colors`, or #rgb or
// #rrggbb) and the effects wave, shake, bold and big, as in {red|NEWT} or {red,wave|hey}. A tag
// may hold one more (one level of nesting: the inner one adds to the outer, its colour wins);
// \{ and \} are braces, a backslash anywhere else is itself, and *, ** and ~ are only text.
// parseMarkup gives the styled runs, the letters that show (graphemes: an emoji is one) and the
// plain text, plus every mistake as an error (the rules show them; the toy still shows the line,
// a stray brace as itself and an unknown style as plain letters). letterPlan and renderMarkup
// build a line as one span a letter, each with its index (--i, for the staggered effects), the
// words with a styled letter kept whole (nowrap, so they never break mid-word); revealLetters
// shows the first n (the rest keep their place, unseen). markup.css draws the effects.

/** The effects a tag can ask for. */
export const TEXT_EFFECTS = /** @type {const} */ (['wave', 'shake', 'bold', 'big']);
/** The palette a content.json without `invitation.text` gets (the admin's Start From the Toy’s Own too). */
export const DEFAULT_TEXT_COLORS = [
  { name: 'red', color: '#c8323c' },
  { name: 'gold', color: '#c9822a' },
  { name: 'rose', color: '#e44544' },
  { name: 'ink', color: '#2b2a33' },
];
/** A colour's name: lowercase letters, numbers and dashes, from a letter. */
export const COLOR_NAME_RE = /^[a-z][a-z0-9-]*$/;
/** A palette colour (the admin's picker takes #rrggbb). */
const PALETTE_HEX_RE = /^#[0-9a-f]{6}$/i;
/** A tag's hex colour. */
const TAG_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * @typedef {object} TextStyle  what a letter shows as (no key: as the line around it)
 * @property {string} [color]  a CSS colour (#rgb or #rrggbb, lowercase)
 * @property {true} [wave]
 * @property {true} [shake]
 * @property {true} [bold]
 * @property {true} [big]
 */
/** @typedef {{text: string, letters: string[], style: TextStyle|null, tokens: string[]}} TextRun */
/** @typedef {{at: number, message: string}} MarkupError  at: where in the source, UTF-16 units */
/**
 * @typedef {object} ParsedText
 * @property {TextRun[]} runs  in order, each a stretch of letters styled alike
 * @property {string[]} letters  every letter that shows
 * @property {(TextStyle|null)[]} styles  each letter's
 * @property {string} plain  the letters as text (the Log, screen readers, the admin's lists)
 * @property {MarkupError[]} errors
 */
/** @typedef {{ch: string, i: number, style: TextStyle|null}} PlannedLetter */
/** @typedef {{whole: boolean, letters: PlannedLetter[]}} LetterGroup  whole: kept on one line */

/**
 * The palette from a list of {name, color} (content.json `invitation.text.colors`): each valid
 * entry's name (lowercased, not an effect's) to its colour (lowercased); the first of a name wins.
 * @param {unknown} list
 * @returns {Map<string, string>}
 */
export function paletteOf(list) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!Array.isArray(list)) return out;
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const name = typeof c.name === 'string' ? c.name.trim().toLowerCase() : '';
    const color = typeof c.color === 'string' ? c.color.trim() : '';
    if (!COLOR_NAME_RE.test(name) || TEXT_EFFECTS.includes(/** @type {any} */ (name))) continue;
    if (!PALETTE_HEX_RE.test(color) || out.has(name)) continue;
    out.set(name, color.toLowerCase());
  }
  return out;
}

/** A plain letter's tokens (one array, so plain letters run together). */
const NO_TOKENS = /** @type {string[]} */ (Object.freeze([]));
/** @type {Intl.Segmenter|null} */
let segmenter = null;
/**
 * A stretch of text as letters (graphemes: an emoji with its skin tone, a flag or a family is one).
 * @param {string} s
 */
function graphemes(s) {
  if (!s) return [];
  try {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(s), (g) => g.segment);
  } catch {
    return Array.from(s);
  }
}

/** A short piece of a tag's head for a message. @param {string} s */
const quoted = (s) => `“${Array.from(s).slice(0, 20).join('')}”`;
const MESSAGES = {
  unclosed: 'This tag never closes: end it with }.',
  stray: 'A } with no tag to close: write \\} for a brace.',
  noBar: 'A tag needs | after its styles, like {red|word}; write \\{ for a brace.',
  empty: 'A tag with no text in it.',
  emptyStyle: 'An empty style in a tag: a comma too many?',
  deep: 'Tags nest one level at most: a tag inside a tag, no deeper.',
  twoColors: 'One color a tag (a tag inside it can change it).',
  /** @param {string} t */
  hex: (t) => `${quoted(t)} isn’t a hex color: use #rgb or #rrggbb.`,
  /** @param {string} t */
  unknown: (t) =>
    `Unknown style ${quoted(t)}: use a color from Text Effects, a hex color like #e44544, or wave, shake, bold or big.`,
};

const isEffect = (t) => TEXT_EFFECTS.includes(/** @type {any} */ (t));

/**
 * A tag's styles (its head, before the |): its colour (token and resolved), its effects, and
 * each mistake in it pushed to `errors` at `at`.
 * @param {string} head
 * @param {Map<string, string>|null} palette
 * @param {number} at
 * @param {MarkupError[]} errors
 */
function readHead(head, palette, at, errors) {
  const out = { colorToken: '', color: '', fx: /** @type {string[]} */ ([]) };
  const err = (message) => errors.push({ at, message });
  for (const raw of head.split(',')) {
    const t = raw.trim().toLowerCase();
    if (!t) err(MESSAGES.emptyStyle);
    else if (isEffect(t)) {
      if (!out.fx.includes(t)) out.fx.push(t);
    } else if (t.startsWith('#') && !TAG_HEX_RE.test(t)) err(MESSAGES.hex(raw.trim()));
    else {
      if (!t.startsWith('#') && palette && !palette.has(t)) err(MESSAGES.unknown(raw.trim()));
      if (out.colorToken) err(MESSAGES.twoColors);
      out.colorToken = t;
      out.color = t.startsWith('#') ? t : (palette?.get(t) ?? '');
    }
  }
  return out;
}

/**
 * @typedef {object} OpenTag  a tag being read, merged with the one it's in
 * @property {string} colorToken
 * @property {string} color
 * @property {string[]} fx
 * @property {number} at  where it opened
 * @property {number} from  the letters before it
 * @property {TextStyle|null} style
 * @property {string[]} tokens  its styles as a tag writes them (clipMarkup)
 */

/**
 * A tag opened inside `outer` (or none): its colour over the outer one, the effects of both.
 * @param {ReturnType<typeof readHead>} own
 * @param {OpenTag|undefined} outer
 * @param {number} at
 * @param {number} from
 * @returns {OpenTag}
 */
function mergeTag(own, outer, at, from) {
  const colorToken = own.colorToken || outer?.colorToken || '';
  const color = own.colorToken ? own.color : (outer?.color ?? '');
  const fx = TEXT_EFFECTS.filter((f) => own.fx.includes(f) || outer?.fx.includes(f));
  /** @type {TextStyle} */
  const style = {};
  if (color) style.color = color;
  for (const f of fx) style[f] = true;
  const tokens = [...(colorToken ? [colorToken] : []), ...fx];
  return { colorToken, color, fx, at, from, style: Object.keys(style).length ? style : null, tokens };
}

/**
 * The runs of letters styled alike.
 * @param {string[]} letters
 * @param {(TextStyle|null)[]} styles
 * @param {string[][]} tokenOf
 */
function runsOf(letters, styles, tokenOf) {
  /** @type {TextRun[]} */
  const runs = [];
  letters.forEach((ch, k) => {
    const last = runs.at(-1);
    if (last && styles[k] === styles[k - 1] && tokenOf[k] === tokenOf[k - 1]) {
      last.letters.push(ch);
      last.text += ch;
    } else runs.push({ text: ch, letters: [ch], style: styles[k], tokens: tokenOf[k] });
  });
  return runs;
}

/**
 * A line's tags read (see the header). `palette` (paletteOf's) resolves colour names; without
 * one, names are left unchecked (the letters and plain text don't depend on it).
 * @param {string} src
 * @param {Map<string, string>|null} [palette]
 * @returns {ParsedText}
 */
export function parseMarkup(src, palette = null) {
  const text = typeof src === 'string' ? src : '';
  /** @type {MarkupError[]} */
  const errors = [];
  /** @type {string[]} */
  const letters = [];
  /** @type {(TextStyle|null)[]} */
  const styles = [];
  /** @type {string[][]} */
  const tokenOf = [];
  /** @type {OpenTag[]} the open tags, outermost first */
  const stack = [];
  let buf = '';
  const flush = () => {
    const top = stack.at(-1);
    for (const g of graphemes(buf)) {
      letters.push(g);
      styles.push(top?.style ?? null);
      tokenOf.push(top?.tokens ?? NO_TOKENS);
    }
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && (text[i + 1] === '{' || text[i + 1] === '}')) {
      buf += text[++i];
    } else if (c === '{') {
      let bar = i + 1;
      while (bar < text.length && !'|{}'.includes(text[bar])) bar++;
      if (text[bar] !== '|') {
        errors.push({ at: i, message: MESSAGES.noBar });
        buf += c;
        continue;
      }
      flush();
      if (stack.length >= 2) errors.push({ at: i, message: MESSAGES.deep });
      stack.push(mergeTag(readHead(text.slice(i + 1, bar), palette, i, errors), stack.at(-1), i, letters.length));
      i = bar;
    } else if (c === '}' && stack.length) {
      flush();
      const open = /** @type {OpenTag} */ (stack.pop());
      if (letters.length === open.from) errors.push({ at: open.at, message: MESSAGES.empty });
    } else {
      if (c === '}') errors.push({ at: i, message: MESSAGES.stray });
      buf += c;
    }
  }
  flush();
  for (const open of stack) errors.push({ at: open.at, message: MESSAGES.unclosed });
  errors.sort((a, b) => a.at - b.at);
  return { runs: runsOf(letters, styles, tokenOf), letters, styles, plain: letters.join(''), errors };
}

/** The last few lines read for their letters (typing asks every frame). */
const memo = new Map();
/** @param {string} src */
function lettersOf(src) {
  let got = memo.get(src);
  if (!got) {
    got = parseMarkup(src).letters;
    if (memo.size > 32) memo.delete(memo.keys().next().value);
    memo.set(src, got);
  }
  return got;
}

/** The letters a line shows (its tags left out; an emoji is one). @param {string} src */
export const visibleLetters = (src) => lettersOf(typeof src === 'string' ? src : '');
/** How many letters a line shows. @param {string} src */
export const letterCount = (src) => visibleLetters(src).length;
/** A line as plain text, its tags left out. @param {string} src */
export const plainText = (src) => visibleLetters(src).join('');

/** Text as it goes in a tag's text: its braces escaped. @param {string} s */
const escaped = (s) => s.replace(/[{}]/g, (b) => `\\${b}`);

/**
 * A line clipped to its first `n` letters, its tags kept (well formed: a cut tag closed).
 * @param {string} src
 * @param {number} n
 */
export function clipMarkup(src, n) {
  const p = parseMarkup(src);
  if (p.letters.length <= n) return src;
  let left = n;
  let out = '';
  for (const r of p.runs) {
    if (left <= 0) break;
    const part = escaped(r.letters.slice(0, left).join(''));
    left -= Math.min(left, r.letters.length);
    out += r.tokens.length ? `{${r.tokens.join(',')}|${part}}` : part;
  }
  return out;
}

const SPACE_RE = /^\s+$/;

/**
 * How a line is built (renderMarkup): its words and the spaces between, each letter with its
 * index and style; a word with any styled letter is kept whole.
 * @param {ParsedText} parsed
 * @returns {LetterGroup[]}
 */
export function letterPlan(parsed) {
  /** @type {LetterGroup[]} */
  const out = [];
  /** @type {LetterGroup|null} */
  let word = null;
  parsed.letters.forEach((ch, i) => {
    const style = parsed.styles[i] ?? null;
    if (SPACE_RE.test(ch)) {
      word = null;
      out.push({ whole: false, letters: [{ ch, i, style }] });
      return;
    }
    if (!word) out.push((word = { whole: false, letters: [] }));
    word.letters.push({ ch, i, style });
    if (style) word.whole = true;
  });
  return out;
}

/**
 * A letter's classes: inv-fx, and inv-fx-<effect> for each it has (a moving one, wave or shake,
 * not on a space: inline-block, so it can move).
 * @param {PlannedLetter} l
 */
function letterClass(l) {
  const s = l.style;
  if (!s) return 'inv-fx';
  const fx = TEXT_EFFECTS.filter((f) => s[f]);
  const moves = (s.wave || s.shake) && !SPACE_RE.test(l.ch);
  return ['inv-fx', ...fx.map((f) => `inv-fx-${f}`), ...(moves ? ['inv-fx-moves'] : [])].join(' ');
}

/**
 * A line built into `into` (emptied first): a span a letter (letterPlan), each with its index
 * (--i) and its colour inline (the admin's policy allows styles set from script), every letter
 * shown. Its letter spans, in order.
 * @param {HTMLElement} into
 * @param {ParsedText} parsed
 * @param {Document} [doc]  what makes the spans (into's own document)
 * @returns {HTMLElement[]}
 */
export function renderMarkup(into, parsed, doc = into.ownerDocument) {
  into.textContent = '';
  /** @type {HTMLElement[]} */
  const spans = [];
  for (const g of letterPlan(parsed)) {
    let parent = into;
    if (g.whole) {
      parent = doc.createElement('span');
      parent.className = 'inv-fx-word';
      into.append(parent);
    }
    for (const l of g.letters) {
      const span = doc.createElement('span');
      span.className = letterClass(l);
      span.textContent = l.ch;
      span.style.setProperty('--i', String(l.i));
      if (l.style?.color) span.style.color = l.style.color;
      parent.append(span);
      spans.push(span);
    }
  }
  return spans;
}

/**
 * Show the first `n` of a line's letter spans, the rest unseen in their place (only those that
 * change are touched). `was`: how many showed before (-1: unknown, every span set).
 * @param {HTMLElement[]} spans
 * @param {number} n
 * @param {number} [was]
 */
export function revealLetters(spans, n, was = -1) {
  const lo = was < 0 ? 0 : Math.min(n, was);
  const hi = was < 0 ? spans.length : Math.max(n, was);
  for (let i = lo; i < hi && i < spans.length; i++) spans[i].classList.toggle('is-unseen', i >= n);
}
