import assert from 'node:assert/strict';
import {
  TEXT_SIZES,
  DEFAULT_TEXT_SIZE,
  stepTextSize,
  readTextSize,
  layoutMinimap,
} from '../src/chat-layout.js';

assert.equal(stepTextSize(15, 1), 16);
assert.equal(stepTextSize(15, -1), 14);
assert.equal(stepTextSize(TEXT_SIZES.at(-1), 1), TEXT_SIZES.at(-1), 'upper bound');
assert.equal(stepTextSize(TEXT_SIZES[0], -1), TEXT_SIZES[0], 'lower bound');
assert.equal(stepTextSize(18, 0), DEFAULT_TEXT_SIZE, 'reset');
assert.equal(stepTextSize(99, 1), 17, 'unknown size steps from default');
assert.equal(DEFAULT_TEXT_SIZE, 16);
assert.equal(readTextSize('17'), 17);
assert.equal(readTextSize('abc'), DEFAULT_TEXT_SIZE);
assert.equal(readTextSize(null), DEFAULT_TEXT_SIZE);

const m = layoutMinimap({
  items: [
    {id: 'a', role: 'user', top: 0, height: 100, blocks: []},
    {
      id: 'b',
      role: 'assistant',
      top: 130,
      height: 870,
      blocks: [
        {kind: 'code', top: 200, height: 100},
        {kind: 'graphic', top: 5000, height: 10},
      ],
    },
  ],
  contentHeight: 2000,
  viewportHeight: 500,
  scrollTop: 1000,
  trackHeight: 400,
});
assert.equal(m.scale, 0.2);
assert.ok(m.scrollable);
assert.deepEqual([m.bars[0].top, m.bars[0].height], [0, 19], '1px gap below each bar');
assert.equal(m.bars[1].blocks.length, 1, 'blocks outside the bar are dropped');
assert.deepEqual(m.window, {top: 200, height: 100});
const end = layoutMinimap({
  items: [],
  contentHeight: 2000,
  viewportHeight: 500,
  scrollTop: 1500,
  trackHeight: 400,
});
assert.equal(end.window.top + end.window.height, 400, 'window stays inside the track at the bottom');
const tiny = layoutMinimap({
  items: [{id: 'x', role: 'user', top: 0, height: 3}],
  contentHeight: 100000,
  viewportHeight: 400,
  scrollTop: 0,
  trackHeight: 400,
});
assert.equal(tiny.bars[0].height, 2, 'minimum bar height');
assert.equal(tiny.window.height, 18, 'minimum window height');
const short = layoutMinimap({
  items: [],
  contentHeight: 300,
  viewportHeight: 500,
  scrollTop: 0,
  trackHeight: 400,
});
assert.equal(short.scrollable, false, 'nothing to navigate when everything fits');
assert.equal(layoutMinimap({}).bars.length, 0);
console.log('Chat layout: text size steps, bounds, reset and minimap scale, gaps, window clamping passed.');
