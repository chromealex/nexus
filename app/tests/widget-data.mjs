import assert from 'node:assert/strict';
import {normalizeWidget, alertKind, tone, WIDGET_TYPES} from '../src/widget-data.js';

assert.equal(normalizeWidget(null), null);
assert.equal(normalizeWidget([]), null);
assert.equal(normalizeWidget({type: 'unknown'}), null);
assert.deepEqual(normalizeWidget({type: 'metric', label: 'Тесты', value: 42, delta: '+3'}), {
  type: 'metric',
  label: 'Тесты',
  value: '42',
  delta: '+3',
  hint: '',
});
assert.equal(normalizeWidget({type: 'metric', label: 'x'}), null, 'value required');
assert.equal(normalizeWidget({type: 'progress', value: '140'}).value, 100, 'progress is clamped');
assert.equal(normalizeWidget({type: 'progress', value: 'abc'}), null);
assert.equal(
  normalizeWidget({type: 'kpis', items: Array.from({length: 20}, (_, i) => ({label: 'k' + i, value: i}))})
    .items.length,
  8
);
assert.equal(
  normalizeWidget({
    type: 'bar',
    items: [
      {label: 'a', value: '1,5'},
      {label: 'b', value: 'x'},
    ],
  }).items.length,
  1,
  'invalid numbers are dropped; comma decimals accepted'
);
assert.equal(
  normalizeWidget({
    type: 'donut',
    items: [
      {label: 'a', value: 2},
      {label: 'z', value: 0},
    ],
  }).type,
  'pie',
  'donut is a pie; zero slices dropped'
);
const line = normalizeWidget({
  type: 'line',
  x: ['пн', 'вт', 'ср'],
  series: [
    {name: 'A', values: [1, '2', null, 9]},
    {name: 'B', values: ['x']},
  ],
});
assert.deepEqual(
  line.series,
  [{name: 'A', values: [1, 2, null]}],
  'values are cut to the x axis; empty series dropped'
);
assert.equal(
  normalizeWidget({type: 'line', x: ['one'], series: [{values: [1]}]}),
  null,
  'a line needs two points'
);
assert.equal(
  normalizeWidget({type: 'timeline', items: [{title: 'Старт', date: '1 ноя', done: true}, {date: 'x'}]}).items
    .length,
  1
);
assert.equal(
  normalizeWidget({type: 'compare', columns: [{title: 'A', items: ['x']}]}),
  null,
  'comparison needs two columns'
);
assert.equal(
  normalizeWidget({
    type: 'compare',
    columns: [
      {title: 'A', items: ['x'], tone: 'danger'},
      {title: 'B', items: ['y']},
    ],
  }).columns[0].tone,
  'caution'
);
assert.deepEqual(
  normalizeWidget({type: 'checklist', items: ['a', {text: 'b', done: true}, {nope: 1}]}).items,
  [
    {text: 'a', done: false},
    {text: 'b', done: true},
  ]
);
assert.equal(normalizeWidget({type: 'callout', tone: 'error', text: 'Сломано'}).tone, 'caution');
assert.equal(
  normalizeWidget({type: 'metric', label: '<img src=x onerror=alert(1)>', value: '1'}).label,
  '<img src=x onerror=alert(1)>',
  'strings stay text; React escapes them'
);
assert.equal(normalizeWidget({type: 'flow', steps: ['x'.repeat(500)]}).steps[0].length, 60);
assert.equal(alertKind('[!WARNING] Осторожно'), 'warning');
assert.equal(alertKind('  [!tip]'), 'tip');
assert.equal(alertKind('Обычная цитата'), null);
assert.equal(tone('info'), 'note');
assert.ok(WIDGET_TYPES.includes('timeline'));
console.log('Answer widgets: all types, limits, number parsing, tones, alerts and untrusted strings passed.');
