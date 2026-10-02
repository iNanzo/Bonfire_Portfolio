// Routing is shared by the browser, static page generator, and regression tests.
// Explicit sets avoid accepting inherited object names from untrusted URLs.
import { screens, items } from './content.js';
const screenIds = new Set(screens.map(({ id }) => id));
const itemIds = new Set(items().map(({ id }) => id));
export function parseRoute(value = '') {
  const parts = value
    .replace(/^#?\/?/, '')
    .replace(/\/$/, '')
    .split('/');
  const [screen = '', item] = parts;
  if (!screen || !screenIds.has(screen) || parts.length > 2) return { screen: 'home', item: null };
  return { screen, item: screen === 'projects' && itemIds.has(item) ? item : null };
}
export function routePath({ screen, item }, base = '/') {
  return base + (screen === 'home' ? '' : screen + '/' + (item ? item + '/' : ''));
}
export function readRoute(location, base = '/') {
  // Legacy links (#/projects) take precedence once; callers replace them with canonical
  // paths. Other hashes (#main, #how-its-made) aren't routes: the path is.
  if (screenIds.has((location.hash ?? '').replace(/^#\/?/, '').split('/')[0])) return parseRoute(location.hash);
  const relative = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : '';
  return parseRoute(relative === 'index.html' ? '' : relative);
}
// Inputs a key press types into. Radios and checkboxes only take Space and the arrows, so
// with one focused (the breakdown's views) the page's letter keys still work.
const PRESSED = new Set(['radio', 'checkbox', 'button', 'submit', 'reset', 'range', 'color']);
export function isEditing(target) {
  const el = target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  return !!el && !(el.tagName === 'INPUT' && PRESSED.has(el.type));
}
