// The invitation toy's content: content.json's `invitation` key, which the admin edits (its
// Invitation page). It passes the content rules (src/contentRules.js), content from before the
// toy (no key) still does, it carries every trigger's speech settings and lines (the words are
// the admin's: never pinned here), and its default look is one the toy shows as stored (look.js
// validLook keeps every value, each Shader value on its control).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateContent } from '../src/contentRules.js';
import { shaderOf, validLook } from '../src/invitation/look.js';
import { SHADER_CONTROLS } from '../src/invitation/shader.js';
import { TRIGGERS, linesFrom, speechFrom } from '../src/invitation/speech.js';

const content = () => JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8'));

test('content.json’s invitation passes the rules; content from before it still does', () => {
  const c = content();
  assert.ok(c.invitation, 'the key is there');
  const r = validateContent(c);
  assert.deepEqual(
    r.errors.filter((e) => e.path.startsWith('invitation')),
    [],
  );
  assert.deepEqual(r.errors, []);
  delete c.invitation;
  assert.deepEqual(validateContent(c).errors, []);
});

test('it carries every trigger’s chance, cooldown and lines, all read as they are', () => {
  const inv = content().invitation;
  for (const k of TRIGGERS) {
    assert.equal(typeof inv.speech[k]?.chance, 'number', `${k}: its chance`);
    assert.equal(typeof inv.speech[k]?.cooldown, 'number', `${k}: its cooldown`);
    assert.ok(Array.isArray(inv.lines[k]), `${k}: its lines`);
  }
  // The toy reads them without dropping or changing a thing.
  const s = speechFrom(inv.speech);
  assert.deepEqual(s.idleEvery, [inv.speech.idleMin, inv.speech.idleMax]);
  for (const k of TRIGGERS) assert.deepEqual(s.triggers[k], inv.speech[k]);
  assert.deepEqual(
    linesFrom(inv.lines),
    Object.fromEntries(TRIGGERS.map((k) => [k, inv.lines[k].map((l) => l.trim())])),
  );
});

test('its default look is one the toy shows as stored: every value kept, every Shader option set', () => {
  const d = content().invitation.defaults;
  const look = validLook(d);
  for (const k of ['pixelSize', 'dither', 'outlines', 'style', 'motion']) assert.equal(look[k], d[k], k);
  assert.deepEqual(Object.keys(d.shader).sort(), SHADER_CONTROLS.map((c) => c.key).sort(), 'every option');
  assert.deepEqual(shaderOf(look), d.shader, 'each on its control, as stored');
});
