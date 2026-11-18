import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.navigator ??= {userAgent: '', language: 'en-US'};

const {Meta} = await import('../src/content/meta.js');

function userScript(body) {
  return `// ==UserScript==\n${body}\n// ==/UserScript==\n`;
}

const pref = {_mine: {enabled: true, autoUpdate: true, userMeta: '@match https://saved.example/*',
  storage: {}, updateURL: '', userVar: {color: {user: 'red'}, size: {user: 'large'}}}};
const source = userScript('// @name mine\n// @version 1\n// @updateURL https://example.com/mine.user.js\n// @var text color "Color" blue\n// @var text size "Size" small');

test('without replacement settings, previous settings are preserved', () => {
  const data = Meta.get(source, pref);
  assert.equal(data.enabled, true);
  assert.equal(data.userMeta, '@match https://saved.example/*');
  assert.equal(data.userVar.color.user, 'red');
  assert.equal(data.userVar.size.user, 'large');
});

test('with replacement settings, previous settings are discarded', () => {
  const settings = {enabled: false, autoUpdate: false, userMeta: '@match https://settings.example/*', userVar: {color: 'green', unknown: 1}};
  const data = Meta.get(source, pref, settings);
  assert.equal(data.enabled, false);
  assert.equal(data.autoUpdate, false);
  assert.equal(data.userMeta, '@match https://settings.example/*');
  assert.equal(data.userVar.color.user, 'green');
  // not merged: a user variable missing from the settings falls back to its default
  assert.equal(data.userVar.size.user, 'small');
  assert.equal(data.userVar.unknown, undefined);
});
