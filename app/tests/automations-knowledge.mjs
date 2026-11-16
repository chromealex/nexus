import assert from 'node:assert/strict';
import {
  scheduleLabel,
  statusLabel,
  emptyAutomation,
  toLocalInput,
  fromLocalInput,
} from '../src/automation-format.js';
import {skillScopeLabel, skillSlug} from '../src/knowledge-format.js';

assert.equal(scheduleLabel({kind: 'daily', time: '09:00'}), 'каждый день в 09:00');
assert.equal(scheduleLabel({kind: 'weekly', time: '10:30', days: [1, 2, 3, 4, 5]}), 'по будням в 10:30');
assert.equal(scheduleLabel({kind: 'weekly', time: '10:30', days: [6, 7]}), 'по выходным в 10:30');
assert.equal(scheduleLabel({kind: 'weekly', time: '08:00', days: [1, 3]}), 'Пн, Ср в 08:00');
assert.match(scheduleLabel({kind: 'interval', minutes: 120}), /каждые 2 часа/);
assert.match(scheduleLabel({kind: 'interval', minutes: 15}), /каждые 15 минут/);
assert.equal(statusLabel('ok'), 'готово');
assert.equal(statusLabel(''), 'ещё не запускалась');
const a = emptyAutomation('p1');
assert.equal(a.projectId, 'p1');
assert.equal(a.mode, 'discuss');
assert.equal(a.chatId, null);
const t = 1794836580;
assert.equal(fromLocalInput(toLocalInput(t)), t - (t % 60));
assert.equal(fromLocalInput('garbage'), 0);

assert.equal(skillSlug('Release Notes!'), 'release-notes');
assert.equal(skillSlug('--Код ревью'), '');
assert.equal(skillSlug('a'.repeat(80)).length, 64);
assert.equal(skillScopeLabel('project'), 'проект');

console.log('Automations and knowledge: schedule labels, local time inputs and skill names passed.');
