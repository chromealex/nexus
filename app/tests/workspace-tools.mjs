import assert from 'node:assert/strict';
import {diffLines, changesSummary, changeLabel} from '../src/changes-format.js';
import {
  readQueue,
  writeQueue,
  enqueue,
  dequeue,
  updateQueued,
  moveFirst,
  QUEUE_LIMIT,
} from '../src/message-queue.js';
import {stripAnsi, pushHistory, appendOutput, OUTPUT_LIMIT} from '../src/terminal-format.js';

// Diff: git headers are dropped, the rest is classified for colouring.
const lines = diffLines(
  'diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n keep\n-old\n+new\n\\ No newline at end of file\n'
);
assert.deepEqual(
  lines.map(l => l.kind),
  ['hunk', 'ctx', 'del', 'add', 'meta']
);
assert.equal(lines[2].text, '-old');
assert.deepEqual(diffLines(''), []);
assert.deepEqual(changesSummary([{added: 3, removed: 1}, {added: null}, {added: 2, removed: 4}]), {
  added: 5,
  removed: 5,
});
assert.equal(changeLabel('D'), 'Удалён');
assert.equal(changeLabel('zz'), 'Изменён');

// Terminal: escape sequences and carriage-return progress are cleaned up.
assert.equal(stripAnsi('\x1b[31mred\x1b[0m ok'), 'red ok');
assert.equal(stripAnsi('10%\r50%\r100%\ndone\n'), '100%\ndone\n');
assert.equal(stripAnsi('a\r\nb'), 'a\r\nb');
assert.deepEqual(pushHistory(['ls', 'pwd'], 'ls'), ['pwd', 'ls']);
assert.equal(
  pushHistory(
    Array.from({length: 300}, (_, i) => 'c' + i),
    'x'
  ).length,
  200
);
const big = appendOutput('', 'x'.repeat(OUTPUT_LIMIT + 10));
assert.ok(big.startsWith('…\n') && big.length === OUTPUT_LIMIT + 2);

// Message queue: per chat, order kept, steer moves an item first, empty edits remove it.
let q = enqueue({}, 'c1', ' first ');
q = enqueue(q, 'c1', 'second');
q = enqueue(q, 'c2', 'other');
q = enqueue(q, 'c1', '   ');
assert.deepEqual(
  q.c1.map(i => i.text),
  ['first', 'second']
);
q = moveFirst(q, 'c1', q.c1[1].id);
assert.deepEqual(
  q.c1.map(i => i.text),
  ['second', 'first']
);
q = updateQueued(q, 'c1', q.c1[0].id, 'edited');
assert.equal(q.c1[0].text, 'edited');
q = updateQueued(q, 'c1', q.c1[0].id, '');
assert.deepEqual(
  q.c1.map(i => i.text),
  ['first']
);
q = dequeue(q, 'c1', q.c1[0].id);
assert.equal(q.c1.length, 0);
q = enqueue(q, 'c3', 'urgent', {front: true});
let full = {};
for (let i = 0; i < QUEUE_LIMIT + 5; i++) full = enqueue(full, 'c', 'm' + i);
assert.equal(full.c.length, QUEUE_LIMIT);
const store = new Map();
const storage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)};
writeQueue(storage, q);
assert.deepEqual(Object.keys(readQueue(storage)).sort(), ['c2', 'c3']);
assert.deepEqual(readQueue({getItem: () => '{bad'}), {});
assert.deepEqual(
  readQueue({
    getItem: () => {
      throw new Error('denied');
    },
  }),
  {}
);

console.log('Workspace tools: diff lines, terminal output cleanup, history and the message queue passed.');
