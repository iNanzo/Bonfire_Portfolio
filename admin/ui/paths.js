// Where a value sits in content.json, three ways: as a list of keys and indexes (['projects',
// 2, 'images', 0, 'alt']), as the key every field carries in data-path
// ('projects[2].images[0].alt'), and as the pattern the schema's tables are keyed by
// ('projects[].images[].alt'). No imports: the form, the search and the tests share them.

/** ['projects', 2, 'name'] → 'projects[2].name' @param {(string|number)[]} path */
export const keyOf = (path) => path.map((k, i) => (typeof k === 'number' ? `[${k}]` : (i ? '.' : '') + k)).join('');
/** ['projects', 2, 'name'] → 'projects[].name' @param {(string|number)[]} path */
export const patternOf = (path) => path.map((k, i) => (typeof k === 'number' ? '[]' : (i ? '.' : '') + k)).join('');
/** 'projects[2].name' → ['projects', 2, 'name'] @param {string} key */
export const parsePath = (key) =>
  [...String(key).matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1]));
/** The value at `path` in `obj` (undefined on the way down stops there). @param {any} obj @param {(string|number)[]} path */
export const getAt = (obj, path) => path.reduce((o, k) => o?.[k], obj);
/** Whether the field at `key` (a data-path) is `section` or inside it. @param {string} key @param {string} section */
export const within = (key, section) =>
  key === section || key.startsWith(`${section}.`) || key.startsWith(`${section}[`);
/** The key one step up ('a.b[2].c' → 'a.b[2]' → 'a.b'), or '' at the top. @param {string} key */
export const parentKey = (key) => {
  const up = key.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
  return up === key ? '' : up;
};
