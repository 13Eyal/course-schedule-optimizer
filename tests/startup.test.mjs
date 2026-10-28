import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);

function openPage(protocol) {
  const appended = [];
  const document = {
    documentElement: { dataset: {} },
    createElement: tag => ({ tag }),
    body: { append: node => appended.push(node) },
  };
  const context = {
    location: { protocol }, document,
    localStorage: { getItem: () => null },
    matchMedia: () => ({ matches: false }),
  };
  for (const script of inlineScripts) runInNewContext(script, context);
  return { document, appended };
}

test('opening HTML from disk shows guidance without requesting the server-only app', () => {
  const { document, appended } = openPage('file:');
  assert.equal(document.documentElement.dataset.launch, 'file');
  assert.equal(appended.length, 0);
  assert.match(html, /start\.bat/);
});

test('opening over HTTP starts the application module and keeps file guidance hidden', () => {
  const { document, appended } = openPage('http:');
  assert.equal(document.documentElement.dataset.launch, undefined);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].type, 'module');
  assert.equal(new URL(appended[0].src, 'http://127.0.0.1:8000/web/index.html').pathname, '/web/scripts/app.js');
});
