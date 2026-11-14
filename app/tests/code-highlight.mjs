import assert from 'node:assert/strict';
import {languageOf, tokenize, tableToTsv} from '../src/code-highlight.js';

const join = tokens => tokens.map(t => t.text).join('');
const of = (tokens, type) => tokens.filter(t => t.type === type).map(t => t.text);

assert.deepEqual(languageOf('language-tsx'), {raw: 'tsx', family: 'ts'});
assert.deepEqual(languageOf('language-rust'), {raw: 'rust', family: 'rust'});
assert.deepEqual(languageOf('language-brainfuck'), {raw: 'brainfuck', family: ''});
assert.deepEqual(languageOf(undefined), {raw: '', family: ''});

const js = 'const x = "a // not comment"; // real\nreturn 42 /* block */';
const t = tokenize(js, 'js');
assert.equal(join(t), js, 'tokens reproduce the source exactly');
assert.deepEqual(of(t, 'string'), ['"a // not comment"']);
assert.deepEqual(of(t, 'comment'), ['// real', '/* block */']);
assert.deepEqual(of(t, 'keyword'), ['const', 'return']);
assert.deepEqual(of(t, 'number'), ['42']);

const py = 'def f(x):\n    return "#no" # yes\n';
assert.deepEqual(of(tokenize(py, 'python'), 'comment'), ['# yes']);
assert.equal(join(tokenize(py, 'python')), py);

const sh = 'echo "$HOME" # comment\ncurl https://x.dev/#anchor';
const st = tokenize(sh, 'shell');
assert.deepEqual(of(st, 'comment'), ['# comment'], '# inside a word is not a comment in shell');
assert.equal(join(st), sh);

const rs = "fn f<'a>(s: &'a str) -> Option<&'a str> { Some(s) }";
const rt = tokenize(rs, 'rust');
assert.equal(join(rt), rs, 'lifetimes do not break tokenizing');
assert.ok(of(rt, 'keyword').includes('fn'));
assert.deepEqual(of(rt, 'string'), []);

const json = '{"name": "Nexus", "n": 3, "ok": true}';
const jt = tokenize(json, 'json');
assert.deepEqual(of(jt, 'property'), ['"name"', '"n"', '"ok"']);
assert.deepEqual(of(jt, 'string'), ['"Nexus"']);
assert.deepEqual(of(jt, 'keyword'), ['true']);

assert.deepEqual(
  of(tokenize('SELECT id FROM t', 'sql'), 'keyword'),
  ['SELECT', 'FROM'],
  'SQL keywords are case-insensitive'
);
assert.deepEqual(
  tokenize('<b>x</b>', ''),
  [{text: '<b>x</b>', type: 'plain'}],
  'unknown language stays plain text'
);
assert.equal(join(tokenize('"unterminated', 'js')), '"unterminated');
assert.equal(
  tableToTsv([
    ['A', 'B'],
    ['1\t2', 'x\ny'],
  ]),
  'A\tB\n1 2\tx y'
);
console.log(
  'Code highlight: languages, comments vs strings, shell #, Rust lifetimes, JSON keys, SQL case, exact round-trip and TSV passed.'
);
