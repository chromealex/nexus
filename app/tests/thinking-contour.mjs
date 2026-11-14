import assert from 'node:assert/strict';
import {thinkingContour} from '../src/thinking-contour.js';
const box = {left: 100, top: 100, right: 500, bottom: 350};
for (const source of [
  {x: 0, y: 200},
  {x: 300, y: 500},
  {x: 300, y: 20},
]) {
  const c = thinkingContour(box, source, {top: 0, bottom: 600});
  assert.ok(c);
  const first = c.paths.map(p => p.match(/^M([^L]+)/)[1]);
  assert.equal(first[0], first[1]);
  assert.equal(c.paths[0].split(' L').at(-1), c.paths[1].split(' L').at(-1));
  for (const path of c.paths)
    for (const match of path.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)) {
      const x = +match[1],
        y = +match[2];
      assert.ok(x >= 100 && x <= 500 && y >= 100 && y <= 350);
      assert.ok(x <= 124 || x >= 476 || y <= 124 || y >= 326, 'contour never crosses text interior');
    }
}
assert.equal(thinkingContour(box, {x: 0, y: 0}, {top: 400, bottom: 600}), null);
const c = thinkingContour(box, {x: 0, y: 0}, {top: 250, bottom: 600});
assert.ok(c.contact.y >= 250);
console.log(
  'Thinking contour: shared contact, opposite branches, rounded boundary and visible clipping passed.'
);
