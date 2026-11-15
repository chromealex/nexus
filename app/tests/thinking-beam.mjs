import assert from 'node:assert/strict';
import {beamPath} from '../src/thinking-beam.js';
const d = beamPath({x: 100, y: 100}, {x: 500, y: 400}, 1.3);
assert.match(d, /^M100\.0 100\.0 C[\d. -]+ 500\.0 400\.0$/);
// Calm: control points sway only a few pixels between moments.
const nums = s => s.match(/-?[\d.]+/g).map(Number);
const a = nums(beamPath({x: 100, y: 100}, {x: 500, y: 400}, 0)),
  b = nums(beamPath({x: 100, y: 100}, {x: 500, y: 400}, 0.05));
assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 2));
console.log('Thinking beam: smooth cubic arc from the persona to the message, gentle sway only.');
