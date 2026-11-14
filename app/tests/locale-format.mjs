import assert from 'node:assert/strict';
import {countLabel} from '../src/locale-format.js';
const forms = {
  0: 'этапов',
  1: 'этап',
  2: 'этапа',
  3: 'этапа',
  4: 'этапа',
  5: 'этапов',
  10: 'этапов',
  11: 'этапов',
  12: 'этапов',
  14: 'этапов',
  20: 'этапов',
  21: 'этап',
  22: 'этапа',
  25: 'этапов',
  101: 'этап',
  111: 'этапов',
  114: 'этапов',
  121: 'этап',
};
for (const [n, word] of Object.entries(forms))
  assert.equal(countLabel(Number(n), 'этап', 'этапа', 'этапов'), `${n} ${word}`);
assert.equal(countLabel(1, 'профиль', 'профиля', 'профилей'), '1 профиль');
assert.equal(countLabel(2, 'профиль', 'профиля', 'профилей'), '2 профиля');
assert.equal(countLabel(5, 'профиль', 'профиля', 'профилей'), '5 профилей');
assert.equal(countLabel(21, 'файл', 'файла', 'файлов'), '21 файл');
assert.equal(countLabel(1.5, 'этап', 'этапа', 'этапов'), '1,5 этапа');
assert.equal(countLabel(NaN, 'этап', 'этапа', 'этапов'), '—');
console.log('Russian count labels: singular, few, many, teens, compound counts and fractions passed.');
