import assert from 'node:assert/strict';
import {messageDate, responseDetails, mergeContinuation, effortLabel} from '../src/chat-message.js';
assert.equal(messageDate('SystemTime { tv_sec: 1730000000, tv_nsec: 100 }').getTime(), 1730000000000);
assert.equal(messageDate('bad'), null);
const events = [
  {id: 2, result: {model: 'gpt-6.1-sol'}},
  {method: 'item/started', params: {item: {id: 'tool1', type: 'commandExecution', command: 'ls src'}}},
  {
    method: 'item/completed',
    params: {item: {id: 'tool1', type: 'commandExecution', command: 'ls src', aggregatedOutput: 'main.jsx'}},
  },
  {method: 'item/agentMessage/delta', params: {delta: 'Текст ответа'}},
  {method: 'turn/completed', params: {turn: {status: 'completed'}}},
];
const details = responseDetails(
  'Route: codex / Work: completed\nModel: default\nTier: balanced\n' + events.map(JSON.stringify).join('\n')
);
assert.equal(details.model, 'gpt-6.1-sol');
assert.equal(details.rows.filter(r => r.title === 'Выполнена команда').length, 1);
assert.match(details.rows.find(r => r.title === 'Выполнена команда').body, /main.jsx/);
assert.equal(
  details.rows.some(r => r.body.includes('Текст ответа')),
  false
);
assert.equal(details.rows.filter(r => r.title === 'Ответ сформирован').length, 1);
assert.equal(responseDetails('Model: default\nmodel: actual-model').model, 'actual-model');
console.log('Message details: actual model, legacy timestamps, tool completion, delta filtering passed.');

const stopped = responseDetails('Route: codex / Work\nModel: gpt-test\nStopped: true');
assert.ok(stopped.rows.some(r => r.title === 'Генерация остановлена'));
assert.equal(
  stopped.rows.some(r => r.title === 'Ответ сформирован'),
  false
);

assert.equal(mergeContinuation('интерфе', 'йса'), 'интерфейса');
assert.equal(mergeContinuation('Начало. ', 'Начало. Продолжение.'), 'Начало. Продолжение.');
const overlap = 'Длинный общий фрагмент ответа без повторения. ';
assert.equal(
  mergeContinuation('Пролог. ' + overlap, overlap + 'Новый текст'),
  'Пролог. ' + overlap + 'Новый текст'
);
assert.equal(responseDetails('Model: test-model\nEffort: high').effort, 'high');
assert.equal(effortLabel('high'), 'Глубоко');
console.log('Continuation merge and displayed reasoning mode passed.');
