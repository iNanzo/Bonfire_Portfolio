// Routing is shared by the browser, static page generator, and regression tests.
// Explicit sets avoid accepting inherited object names from untrusted URLs.
import { screens, items } from './content.js';
const screenIds = new Set(screens.map(({ id }) => id));
const itemIds = new Set(items().map(({ id }) => id));
export function parseRoute(value = '') {
  const parts = value.replace(/^#?\/?/, '').replace(/\/$/, '').split('/');
  const [screen = '', item] = parts;
  if (!screen || !screenIds.has(screen) || parts.length > 2) return { screen: 'home', item: null };
  return { screen, item: screen === 'projects' && itemIds.has(item) ? item : null };
}
export function routePath({ screen, item }, base = '/') {
  return base + (screen === 'home' ? '' : screen + '/' + (item ? item + '/' : ''));
}
export function readRoute(location, base = '/') {
  // Legacy links take precedence once; callers replace them with canonical paths.
  if (location.hash && location.hash !== '#main') return parseRoute(location.hash);
  const relative = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : '';
  return parseRoute(relative === 'index.html' ? '' : relative);
}
export function isEditing(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}
