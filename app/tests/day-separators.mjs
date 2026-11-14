import assert from 'node:assert/strict';
import {dayKey, dayLabel} from '../src/chat-message.js';
const now = new Date(2026, 10, 14, 10, 30);
assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
assert.equal(dayKey(null), null);
assert.equal(dayKey('not a date'), null);
assert.equal(dayLabel(new Date(2026, 10, 14, 0, 1), now), 'Сегодня');
assert.equal(dayLabel(new Date(2026, 10, 13, 23, 59), now), 'Вчера');
assert.equal(dayLabel(new Date(2026, 10, 12, 9), now), '12 ноября');
assert.equal(dayLabel(new Date(2025, 11, 31, 9), now), '31 декабря 2025', 'other year shows the year');
assert.equal(dayLabel(new Date(2026, 0, 1), new Date(2026, 0, 1, 8)), 'Сегодня');
assert.equal(
  dayLabel(new Date(2025, 11, 31), new Date(2026, 0, 1, 8)),
  'Вчера',
  'yesterday across the year boundary'
);
assert.equal(dayLabel(undefined, now), '');
console.log('Day separators: today, yesterday, month names, year boundary and invalid dates passed.');
