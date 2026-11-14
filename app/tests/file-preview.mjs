import assert from 'node:assert/strict';
import {filePathRef, fileKind, parseDelimited, languageForFile} from '../src/chat-files.js';

assert.deepEqual(filePathRef('src/main.rs:42'), {path: 'src/main.rs', line: 42});
assert.deepEqual(filePathRef('src/main.rs:42:7'), {path: 'src/main.rs', line: 42});
assert.deepEqual(filePathRef('./README.md'), {path: './README.md', line: null});
assert.deepEqual(filePathRef('~/Notes/plan.md'), {path: '~/Notes/plan.md', line: null});
assert.deepEqual(filePathRef('/Users/a/x.json'), {path: '/Users/a/x.json', line: null});
assert.deepEqual(filePathRef('package.json'), {path: 'package.json', line: null});
assert.deepEqual(filePathRef('file:///tmp/a.txt'), {path: '/tmp/a.txt', line: null});
for (const text of [
  'example.com',
  'v1.2.3',
  'npm test',
  'https://a.b/c.md',
  'foo',
  'a.b.zz',
  'Array.map',
  '1.5',
])
  assert.equal(filePathRef(text), null, text);

assert.equal(fileKind('a.md'), 'markdown');
assert.equal(fileKind('index.html'), 'html');
assert.equal(fileKind('icon.svg'), 'svg');
assert.equal(fileKind('data.csv'), 'table');
assert.equal(fileKind('p.json'), 'json');
assert.equal(fileKind('main.rs'), 'code');
assert.equal(fileKind('photo.PNG'), 'image');
assert.equal(fileKind('doc.pdf'), 'pdf');
assert.equal(fileKind('song.mp3'), 'audio');
assert.equal(fileKind('report.docx'), 'file');
assert.equal(fileKind('binary.bin'), 'file');

assert.deepEqual(parseDelimited('a,b\n"x, y","say ""hi"""\n'), [
  ['a', 'b'],
  ['x, y', 'say "hi"'],
]);
assert.deepEqual(parseDelimited('a\tb\r\n1\t2', '\t'), [
  ['a', 'b'],
  ['1', '2'],
]);
assert.equal(parseDelimited('1\n2\n3\n4', ',', 2).length, 2);
assert.equal(languageForFile('x.rs'), 'language-rust');
assert.equal(languageForFile('x.tsx'), 'language-tsx');
console.log('File preview: path detection, kinds, CSV parsing and languages passed.');
