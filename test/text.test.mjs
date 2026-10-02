// Title Case (src/text.js), the rule every label, heading, tab, button and option follows in
// all four front ends: each word capitalized but the articles a / an / the (unless first),
// only a word's first letter changed. The admin reads the same function (admin/ui/text.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleCase } from '../src/text.js';
import { titleCase as adminTitleCase } from '../admin/ui/text.js';

test('titleCase: every word but a, an and the; only first letters change', () => {
  assert.equal(titleCase('leadership & earlier work'), 'Leadership & Earlier Work');
  assert.equal(titleCase('the problem with a plan'), 'The Problem With a Plan');
  assert.equal(titleCase('pixel size (small screens)'), 'Pixel Size (Small Screens)');
  assert.equal(titleCase('convert to WebP'), 'Convert To WebP');
  assert.equal(titleCase('in the mix'), 'In the Mix');
  assert.equal(titleCase('All In The Mix'), 'All In the Mix', 'an article mid-way goes lower case');
  assert.equal(titleCase('an ID of 404'), 'An ID Of 404');
  assert.equal(titleCase('hi-hat sparks'), 'Hi-hat Sparks', 'a word, not each part of it');
  assert.equal(titleCase('“quoted” é-word'), '“Quoted” É-word', 'the first letter, past any punctuation');
  assert.equal(titleCase(''), '');
  assert.equal(titleCase(42), '42');
});

test('the admin uses the shared rule', () => {
  assert.equal(adminTitleCase, titleCase);
});
