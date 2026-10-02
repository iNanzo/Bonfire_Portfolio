// The site's words as src/content.json has them now, for the specs that find things by their
// names. The admin edits that file and every save deploys only if the tests pass, so a spec
// reads a name from here instead of pinning it: renaming a menu item or a heading in the
// admin can't fail a deploy (CONTRIBUTING.md). The site under test is built from this file.
import { readFileSync } from 'node:fs';

export const content = JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
export const ui = content.ui;

/** A pattern for text that starts with `text`, taken as typed (nothing in it is special). */
export const startsWith = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

/** A screen's name, as the menu's Go To and the header's tabs show it. */
export const screenLabel = (id) => content.screens.find((s) => s.id === id)?.label;
