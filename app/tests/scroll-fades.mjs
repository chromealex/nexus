import assert from 'node:assert/strict';
import {fadeEdges} from '../src/scroll-fades.js';
assert.deepEqual(fadeEdges({scrollTop: 0, scrollHeight: 100, clientHeight: 100}), {
  top: false,
  bottom: false,
});
assert.deepEqual(fadeEdges({scrollTop: 0, scrollHeight: 500, clientHeight: 100}), {top: false, bottom: true});
assert.deepEqual(fadeEdges({scrollTop: 200, scrollHeight: 500, clientHeight: 100}), {
  top: true,
  bottom: true,
});
assert.deepEqual(fadeEdges({scrollTop: 400, scrollHeight: 500, clientHeight: 100}), {
  top: true,
  bottom: false,
});
console.log('Scroll fades: edges at top, middle and end passed.');
