import assert from 'node:assert/strict';
import {
  draftKey,
  loadDraft,
  saveDraft,
  loadBookmarks,
  toggleBookmark,
  excerpt,
  isLongMessage,
  chatToMarkdown,
} from '../src/chat-local.js';

const memory = () => {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    size: () => map.size,
  };
};
const broken = {
  getItem() {
    throw Error('denied');
  },
  setItem() {
    throw Error('denied');
  },
  removeItem() {
    throw Error('denied');
  },
};

assert.equal(draftKey('c1', 'p'), 'nexus-draft:c1');
assert.equal(
  draftKey('', 'p'),
  'nexus-draft:project:p',
  'a project without an open chat keeps its own draft'
);
const s = memory();
saveDraft(s, 'k', 'Привет', [{id: 'f1', name: 'a.png'}]);
assert.deepEqual(loadDraft(s, 'k'), {text: 'Привет', files: [{id: 'f1', name: 'a.png'}]});
saveDraft(s, 'k', '', []);
assert.equal(s.size(), 0, 'empty draft removes the key');
assert.deepEqual(loadDraft(s, 'missing'), {text: '', files: []});
s.setItem('bad', '{not json');
assert.deepEqual(loadDraft(s, 'bad'), {text: '', files: []});
s.setItem('weird', JSON.stringify({text: 42, files: [{nope: 1}, {id: 'ok'}]}));
assert.deepEqual(loadDraft(s, 'weird'), {text: '', files: [{id: 'ok'}]});
assert.deepEqual(loadDraft(broken, 'k'), {text: '', files: []}, 'storage errors are tolerated');
saveDraft(broken, 'k', 'x', []);

const b = memory();
assert.equal(toggleBookmark(b, 'c', {id: 'm1', role: 'assistant', content: '**Важный** ответ'}).length, 1);
assert.equal(loadBookmarks(b, 'c')[0].excerpt, 'Важный ответ');
assert.equal(toggleBookmark(b, 'c', {id: 'm1'}).length, 0, 'second toggle removes');
assert.equal(b.size(), 0);
assert.deepEqual(loadBookmarks(broken, 'c'), []);

assert.equal(excerpt('a```js\nlong code\n```b', 50), 'a [код] b');
assert.equal(excerpt('x'.repeat(200), 10).length, 10);
assert.equal(isLongMessage('short'), false);
assert.equal(isLongMessage('a\n'.repeat(20)), true);
assert.equal(isLongMessage('x'.repeat(1300)), true);

const md = chatToMarkdown({
  title: 'План',
  project: 'Nexus',
  exportedAt: new Date(2026, 10, 14, 10, 0),
  messages: [
    {role: 'user', content: 'Вопрос', attachments: [{name: 'a.png'}]},
    {role: 'system', content: 'skip'},
    {role: 'assistant', content: 'Ответ\n\n\n\nконец'},
  ],
});
assert.ok(md.startsWith('# План\n'));
assert.ok(md.includes('## Вы'));
assert.ok(md.includes('Файлы: a.png'));
assert.ok(!md.includes('skip'), 'system messages are not exported');
assert.ok(!/\n{3,}/.test(md));
assert.ok(md.endsWith('конец\n'));
console.log(
  'Chat local state: drafts, broken storage, bookmarks, excerpts, long messages and Markdown export passed.'
);
import {clock, stageLabel} from '../src/chat-local.js';
assert.equal(clock(0), '0:00');
assert.equal(clock(61500), '1:01');
assert.equal(clock(-5), '0:00');
assert.equal(stageLabel('Selecting an available agent…'), 'выбираю агента');
assert.equal(
  stageLabel('Selected codex / Личный · standard. Waiting for the agent response…'),
  'codex · Личный · жду ответ'
);
assert.equal(stageLabel('Команда: объединение результатов'), 'Команда: объединение результатов');
assert.equal(stageLabel('x'.repeat(100)).length, 70);
assert.equal(stageLabel(undefined), '');
console.log('Generation status: elapsed clock and readable stages passed.');
