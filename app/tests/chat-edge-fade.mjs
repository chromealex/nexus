import assert from 'node:assert/strict';
import {edgeMask} from '../src/chat-edge-fade.js';
import {ditherLevels} from '../src/dither.js';

const view = {top: 100, bottom: 600};
// Nothing fades at the very top of the history or in the middle of the view.
assert.equal(edgeMask({top: 80, bottom: 200}, view, {top: false, bottom: true}), '');
assert.equal(edgeMask({top: 300, bottom: 400}, view, {top: true, bottom: true}), '');
// An element crossing the top edge dissolves in its own coordinates.
assert.equal(
  edgeMask({top: 80, bottom: 200}, view, {top: true, bottom: false, size: 40}),
  'linear-gradient(to bottom, transparent 20px, #000 60px)'
);
// Crossing the bottom edge.
assert.equal(
  edgeMask({top: 500, bottom: 700}, view, {top: false, bottom: true, size: 40}),
  'linear-gradient(to bottom, #000 0px, #000 60px, transparent 100px)'
);
// A tall element crossing both edges.
assert.equal(
  edgeMask({top: 0, bottom: 1000}, view, {top: true, bottom: true, size: 40}),
  'linear-gradient(to bottom, transparent 100px, #000 140px, #000 560px, transparent 600px)'
);
// Dither stays within ±amplitude around mid-grey.
const levels = ditherLevels(4096, 12);
assert.ok(levels.every(v => v >= 116 && v <= 140));
console.log('Chat edge fade: top/bottom masks per element and dither range passed.');
