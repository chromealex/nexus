import assert from 'node:assert/strict';
import {
  BROWSER_MODES,
  browserSummary,
  browserHint,
  browserRequest,
  normalizeMode,
  pageCoords,
  keyAction,
  previewVisible,
  tabTitle,
} from '../src/browser-mode.js';

assert.deepEqual(Object.keys(BROWSER_MODES), ['builtin', 'chrome', 'off']);
assert.equal(normalizeMode('isolated'), 'builtin');
assert.equal(normalizeMode(undefined), 'builtin');
assert.equal(normalizeMode('chrome'), 'chrome');
assert.equal(browserSummary('builtin'), '');
assert.equal(browserSummary('off'), 'Без браузера');
assert.equal(browserSummary('chrome'), 'Мой Chrome');

const ready = {installed: true, node: true, chrome: true, version: '0.0.85'};
assert.equal(browserHint('builtin', {...ready, installed: false}).action, 'install');
assert.match(browserHint('builtin', {...ready, node: false}).text, /Node/);
assert.match(browserHint('chrome', {...ready, chrome: false}).text, /Chrome/);
assert.equal(browserHint('chrome', ready).action, 'extension');
assert.equal(browserHint('builtin', ready).tone, 'info');
assert.equal(browserHint('off', ready).action, undefined);

const own = browserRequest({mode: 'chrome', summary: 'Нажать «Купить»', host: 'shop.example'});
assert.ok(own.own);
assert.ok(!browserRequest({mode: 'builtin'}).own);
assert.match(browserRequest({mode: 'builtin'}).where, /встроенном/);

// Pane → page coordinates follow the scaled screenshot and reject points outside it.
const rect = {left: 100, top: 50, width: 640, height: 430};
assert.deepEqual(pageCoords(420, 265, rect, {width: 1280, height: 860}), {x: 640, y: 430});
assert.equal(pageCoords(90, 265, rect, {width: 1280, height: 860}), null);
assert.equal(pageCoords(200, 200, rect, null), null);

assert.deepEqual(keyAction({key: 'a'}), {type: 'text', text: 'a'});
assert.deepEqual(keyAction({key: 'ё'}), {type: 'text', text: 'ё'});
assert.deepEqual(keyAction({key: 'Enter'}), {type: 'key', key: 'Enter'});
assert.deepEqual(keyAction({key: 'Tab', shiftKey: true}), {type: 'key', key: 'Shift+Tab'});
assert.deepEqual(keyAction({key: 'a', metaKey: true}), {type: 'key', key: 'Meta+a'});
assert.equal(keyAction({key: 'w', metaKey: true}), null);
assert.equal(keyAction({key: 'Shift'}), null);
assert.equal(keyAction({key: 'a', isComposing: true}), null);

const now = 100000;
assert.equal(previewVisible({paneOpen: true, mode: 'builtin', agentBusy: true, now}), false);
assert.equal(previewVisible({paneOpen: false, mode: 'builtin', agentBusy: true, now}), false);
assert.equal(
  previewVisible({paneOpen: false, mode: 'builtin', agentBusy: true, activityAt: now - 1000, now}),
  true
);
assert.equal(previewVisible({paneOpen: false, mode: 'chrome', agentBusy: true, activityAt: now, now}), false);
assert.equal(
  previewVisible({paneOpen: false, mode: 'builtin', activityAt: now - 10000, hasFrame: true, now}),
  true
);
assert.equal(
  previewVisible({paneOpen: false, mode: 'builtin', activityAt: now - 60000, hasFrame: true, now}),
  false
);

assert.equal(tabTitle({title: 'Docs', url: 'https://a.b'}), 'Docs');
assert.equal(tabTitle({url: 'https://shop.example.com/x'}), 'shop.example.com');
assert.equal(tabTitle({url: 'about:blank'}), 'Новая вкладка');
console.log('Chat browser: modes, hints, coordinates, keys, preview and tab titles passed.');
