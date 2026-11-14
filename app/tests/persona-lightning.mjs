import assert from 'node:assert/strict';
import {hitPersona, lightningPaths} from '../src/persona-lightning.js';
const data = new Float32Array(64000 * 18);
data[17] = 1;
data[2] = 0.2;
assert.deepEqual(hitPersona(data, 400, 300, 800, 600, 1), {x: 400, y: 300});
assert.equal(hitPersona(data, 10, 10, 800, 600, 1), null);
data[17] = -1;
assert.equal(hitPersona(data, 400, 300, 800, 600, 1), null);
for (const [width, height] of [
  [320, 700],
  [1400, 600],
]) {
  const origin = {x: width * 0.6, y: height * 0.4},
    paths = lightningPaths(origin, width, height, () => 0.4);
  assert.ok(paths.length >= 10);
  assert.ok(paths[0].d.startsWith(`M${origin.x.toFixed(2)} ${origin.y.toFixed(2)}`));
  for (const path of paths) {
    assert.ok(path.width > 0 && path.width <= 1.55);
    assert.ok(path.delay >= 0 && path.delay < 150);
    const values = path.d.match(/-?\d+\.\d+/g).map(Number);
    assert.ok(values.every(Number.isFinite));
    for (let i = 0; i < values.length; i += 2) {
      assert.ok(values[i] >= 0 && values[i] <= width);
      assert.ok(values[i + 1] >= 0 && values[i + 1] <= height);
    }
  }
}
console.log('Lightning: surface hit/miss, front faces, anchored branches and viewport bounds passed.');

const arcs = lightningPaths({x: 480, y: 250}, 800, 600, () => 0.4);
const coords = d => d.match(/-?\d+\.\d+/g).map(Number);
for (let i = 1; i < 4; i++) {
  const prior = coords(arcs[i - 1].d),
    next = coords(arcs[i].d);
  assert.deepEqual(prior.slice(-2), next.slice(0, 2));
  assert.ok(arcs[i].width < arcs[i - 1].width);
  assert.ok(arcs[i].delay > arcs[i - 1].delay);
}
const trunk = arcs.slice(0, 4).flatMap(p => {
  const c = coords(p.d),
    a = [];
  for (let i = 0; i < c.length; i += 2) a.push(c.slice(i, i + 2));
  return a;
});
const nodes = arcs.flatMap(p => {
  const c = coords(p.d),
    a = [];
  for (let i = 0; i < c.length; i += 2) a.push(c.slice(i, i + 2).join(','));
  return a;
});
for (const arc of arcs.filter(p => p.branch))
  assert.ok(nodes.filter(n => n === coords(arc.d).slice(0, 2).join(',')).length >= 2);
assert.ok(trunk.length > 32);
console.log('Lightning channels: connected tapered trunk, delayed branches and multiscale geometry passed.');

const {internalDischarge, excitationEnvelope, CHARGE_DURATION_MS} =
  await import('../src/persona-lightning.js');
assert.equal(CHARGE_DURATION_MS, 8000);
assert.equal(excitationEnvelope(-1), 0);
assert.equal(excitationEnvelope(0), 0);
assert.equal(excitationEnvelope(8), 0);
assert.equal(excitationEnvelope(20), 0);
assert.ok(excitationEnvelope(1) > excitationEnvelope(4) && excitationEnvelope(4) > excitationEnvelope(7));
const surface = new Float32Array(64000 * 18);
for (let i = 0; i < 100; i++) {
  surface[i * 18] = (i - 50) / 100;
  surface[i * 18 + 17] = 1;
}
const discharge = internalDischarge(surface, {x: 400, y: 300}, 800, 600, 1, () => 0.4);
assert.equal(discharge.chargePath.length, 36);
assert.ok(discharge.chargePath.every(Number.isFinite));
assert.equal(discharge.paths.filter(p => p.internal).length, 11);
assert.ok(discharge.paths.filter(p => !p.internal).every(p => p.delay >= 605));
const internalEnd = coords(discharge.paths[10].d).slice(-2),
  externalStart = coords(discharge.paths[11].d).slice(0, 2);
assert.deepEqual(internalEnd, externalStart);
assert.ok(discharge.exit.x > 400);
console.log('Excitation: internal-to-external continuity, delayed exit and eight-second decay passed.');
