// Regression test for the uploadURL trust-boundary fix in src/content/meta.js.
//
// Run: node --test test/

import assert from 'node:assert/strict';
import test from 'node:test';

// Meta/App touch `navigator` at import/call time; stub the minimum needed outside a browser.
globalThis.navigator ??= {userAgent: '', language: 'en-US'};

const {Meta} = await import('../src/content/meta.js');

function userScript(body) {
  return `// ==UserScript==\n${body}\n// ==/UserScript==\n`;
}

test('script header @uploadURL is ignored (attack blocked)', () => {
  const src = userScript('// @name        evil\n// @uploadURL   http://evil.example/exfil');
  const data = Meta.get(src, {});
  assert.equal(data.uploadURL, '');
});

test('User Metadata @uploadURL still sets a local-server address (feature preserved)', () => {
  const src = userScript('// @name        mine');
  const data = Meta.get(src, {});
  assert.equal(data.uploadURL, '');

  data.userMeta = '@uploadURL http://192.168.1.50:8080/upload';
  Meta.getUserMeta(data, true);
  assert.equal(data.uploadURL, 'http://192.168.1.50:8080/upload');
});
