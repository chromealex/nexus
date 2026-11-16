import assert from 'node:assert/strict';
import {answerReaction, reactionSignals} from '../src/answer-reaction.js';

for (const t of [
  'Спасибо!',
  'Давай дальше',
  'Предложи варианты меню',
  'Теперь добавь тесты',
  'Сделай логотип для проекта',
])
  assert.equal(answerReaction(t), 'success', t);
for (const t of ['Нет, не то', 'Исправь отступы', 'Ты забыл про README', 'Опять ошибка', 'не работает'])
  assert.equal(answerReaction(t), 'correction', t);
for (const t of [
  'Вот это меню, которое ты сделал раньше, не работает',
  'После твоих правок сломалось сохранение',
])
  assert.equal(answerReaction(t), 'regression', t);
assert.equal(answerReaction('Почему ты выбрал этот вариант?'), 'neutral');

const answers = [{id: 'a1'}, {id: 'a2'}, {id: 'a3'}];
assert.deepEqual(reactionSignals('Давай дальше', answers), [{messageId: 'a3', signal: 1}]);
assert.deepEqual(reactionSignals('Не то', answers), [{messageId: 'a3', signal: -1}]);
assert.deepEqual(reactionSignals('То, что ты сделал раньше, сломалось', answers), [
  {messageId: 'a2', signal: -1, regression: true},
]);
console.log('Answer reactions: moving on is success, corrections and later regressions take points away.');
