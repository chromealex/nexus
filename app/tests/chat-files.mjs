import assert from 'node:assert/strict';
import {
  previewKind,
  normalizeQuestions,
  restoreQuestionSelection,
  legacyQuestionSelection,
} from '../src/chat-files.js';
for (const [name, expected] of [
  ['photo.PNG', 'image'],
  ['report.pdf', 'pdf'],
  ['notes.md', 'text'],
  ['index.html', 'text'],
  ['log.json', 'text'],
  ['song.mp3', 'audio'],
  ['movie.mp4', 'video'],
  ['project.zip', 'file'],
  ['balance.xlsx', 'file'],
])
  assert.equal(previewKind({name}), expected);
const questions = normalizeQuestions({
  question: 'Выберите формат',
  options: ['Кратко', {label: 'Подробно', description: 'С примерами'}],
});
assert.equal(questions[0].options[1].description, 'С примерами');
assert.equal(questions[0].options[0].label, 'Кратко');
assert.equal(normalizeQuestions({options: ['a']}).length, 0);
assert.equal(
  normalizeQuestions(Array.from({length: 20}, (_, i) => ({id: i, question: 'Question'}))).length,
  6
);
assert.equal(normalizeQuestions({question: 'Test', options: Array(20).fill('A')})[0].options.length, 8);
console.log('Attachment preview types and bounded agent questions passed.');

assert.equal(normalizeQuestions({question: 'Test', multiple: true, options: ['A', 'B']})[0].multiple, true);
assert.equal(normalizeQuestions({question: 'Test', options: ['A']})[0].multiple, false);

const multi = {question: 'Formats?', multiple: true, options: ['Images', 'PDF', 'Text']};
const saved = {0: {answers: ['Images', 'PDF', 'Own format']}};
const restored = restoreQuestionSelection(multi, JSON.parse(JSON.stringify(saved)));
assert.deepEqual(restored.answers['0'], ['Images', 'PDF']);
assert.equal(restored.custom['0'], 'Own format');
assert.equal(restored.own['0'], true);
assert.deepEqual(legacyQuestionSelection(multi, 'Formats?: Images, PDF'), {0: {answers: ['Images', 'PDF']}});
assert.deepEqual(legacyQuestionSelection({question: 'Style?', options: ['Short', 'Long']}, 'Style?: Short'), {
  0: {answers: ['Short']},
});
assert.equal(legacyQuestionSelection(multi, 'Another question: Images'), null);
assert.deepEqual(
  restoreQuestionSelection({question: 'Style?', options: ['Short']}, {0: {answers: ['Custom style']}}).custom,
  {0: 'Custom style'}
);
console.log('Selections: saved multi-choice, custom text and legacy history restored.');
