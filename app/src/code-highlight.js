// Small dependency-free syntax highlighter for chat code blocks.
// It recognises comments, strings, numbers and keywords for common languages and returns tokens;
// the UI renders them as React text, so nothing from a model answer is ever injected as HTML.

const C_LIKE =
  'break case catch class const continue default do else enum export extends false finally for function if import in instanceof interface let new null return static super switch this throw true try typeof undefined var void while with yield async await of as type implements private protected public readonly';
const KEYWORDS = {
  js: C_LIKE,
  ts: C_LIKE,
  rust: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while Some None Ok Err',
  python:
    'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false',
  java: 'abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new null package private protected public return short static super switch synchronized this throw throws try void volatile while true false var',
  swift:
    'as break case catch class continue default defer do else enum extension false for func guard if import in init let nil private protocol public return self static struct switch throw throws true try var where while',
  c: 'auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while true false nullptr class public private protected template typename namespace using new delete',
  shell:
    'if then else elif fi for while do done case esac in function return export local readonly echo cd exit sudo',
  sql: 'select from where insert into values update set delete create table alter drop index join left right inner outer on group by order having limit offset as and or not null is in like distinct union primary key foreign references default',
  css: '',
  json: 'true false null',
  yaml: 'true false null yes no',
};
const ALIASES = {
  javascript: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  typescript: 'ts',
  tsx: 'ts',
  rs: 'rust',
  py: 'python',
  golang: 'go',
  kotlin: 'java',
  kt: 'java',
  cpp: 'c',
  'c++': 'c',
  h: 'c',
  hpp: 'c',
  cs: 'java',
  csharp: 'java',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  console: 'shell',
  postgres: 'sql',
  mysql: 'sql',
  yml: 'yaml',
  scss: 'css',
  less: 'css',
  objc: 'c',
  m: 'c',
  swiftui: 'swift',
};

export function languageOf(className = '') {
  const raw =
    String(className)
      .match(/language-([\w+#.-]+)/)?.[1]
      ?.toLowerCase() || '';
  return {raw, family: KEYWORDS[raw] !== undefined ? raw : ALIASES[raw] || ''};
}

const LINE_COMMENT = {
  js: '//',
  ts: '//',
  rust: '//',
  go: '//',
  java: '//',
  swift: '//',
  c: '//',
  python: '#',
  shell: '#',
  yaml: '#',
  sql: '--',
};
const BLOCK_COMMENT = {js: 1, ts: 1, rust: 1, go: 1, java: 1, swift: 1, c: 1, css: 1, sql: 1};

// Returns [{text, type}] where type is one of: plain, comment, string, number, keyword, property.
export function tokenize(code, family) {
  const text = String(code ?? '');
  if (!family || text.length > 60000) return [{text, type: 'plain'}];
  const keywords = new Set((KEYWORDS[family] || '').split(' ').filter(Boolean));
  const caseless = family === 'sql';
  const line = LINE_COMMENT[family];
  const out = [];
  let plain = '';
  const flush = () => {
    if (plain) {
      out.push({text: plain, type: 'plain'});
      plain = '';
    }
  };
  const push = (value, type) => {
    flush();
    out.push({text: value, type});
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const rest = text.startsWith.bind(text);
    if (
      line &&
      rest(line, i) &&
      !(family === 'shell' && i > 0 && /\S/.test(text[i - 1]) && text[i - 1] !== ';')
    ) {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : end;
      push(text.slice(i, stop), 'comment');
      i = stop;
      continue;
    }
    if (BLOCK_COMMENT[family] && rest('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      push(text.slice(i, stop), 'comment');
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      if (
        ch === "'" &&
        family === 'rust' &&
        /^'[a-z_]\w*(?!')/.test(text.slice(i, i + 32)) &&
        text[i + 2] !== "'"
      ) {
        plain += ch;
        i++;
        continue;
      }
      let j = i + 1;
      while (j < text.length && text[j] !== ch) {
        if (text[j] === '\\') j++;
        if (text[j] === '\n' && ch !== '`' && family !== 'python') break;
        j++;
      }
      const stop = Math.min(text.length, j + 1);
      const value = text.slice(i, stop);
      const isKey = family === 'json' && /^\s*:/.test(text.slice(stop, stop + 4));
      push(value, isKey ? 'property' : 'string');
      i = stop;
      continue;
    }
    if (/[0-9]/.test(ch) && !/[\w$]/.test(text[i - 1] || '')) {
      const m = text.slice(i).match(/^(0x[\da-f_]+|\d[\d_]*(\.\d+)?(e[+-]?\d+)?)[a-z\d]*/i);
      push(m[0], 'number');
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const m = text.slice(i).match(/^[A-Za-z_$][\w$]*/);
      const word = m[0];
      if (keywords.has(caseless ? word.toLowerCase() : word)) push(word, 'keyword');
      else plain += word;
      i += word.length;
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
  return out;
}

// Table rows as tab-separated text: pastes straight into Numbers, Excel and Google Sheets.
export function tableToTsv(rows) {
  return rows
    .map(cells =>
      cells
        .map(c =>
          String(c ?? '')
            .replace(/[\t\n\r]+/g, ' ')
            .trim()
        )
        .join('\t')
    )
    .join('\n');
}
