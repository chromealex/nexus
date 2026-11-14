export function previewKind(file) {
  const ext = file.name?.split('.').pop()?.toLowerCase();
  if (file.mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext))
    return 'image';
  if (file.mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (file.mime?.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio';
  if (file.mime?.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (
    file.mime?.startsWith('text/') ||
    [
      'txt',
      'md',
      'csv',
      'tsv',
      'json',
      'js',
      'jsx',
      'ts',
      'tsx',
      'py',
      'rs',
      'css',
      'html',
      'xml',
      'yaml',
      'yml',
      'log',
      'sql',
      'sh',
      'c',
      'cpp',
      'h',
    ].includes(ext)
  )
    return 'text';
  return 'file';
}
export function normalizeQuestions(value) {
  const rows = Array.isArray(value) ? value : [value];
  return rows
    .slice(0, 6)
    .map((q, i) => ({
      id: String(q.id || i),
      question: String(q.question || '').slice(0, 1500),
      options: (Array.isArray(q.options) ? q.options : [])
        .slice(0, 8)
        .map(o =>
          typeof o === 'string'
            ? {label: o, description: ''}
            : {label: String(o.label || ''), description: String(o.description || '')}
        )
        .filter(o => o.label),
      multiple: q.multiple === true || q.multiSelect === true,
      isSecret: !!q.isSecret,
    }))
    .filter(q => q.question);
}

export function restoreQuestionSelection(questions, saved) {
  const answers = {},
    custom = {},
    own = {};
  for (const q of normalizeQuestions(questions)) {
    const values = Array.isArray(saved?.[q.id]?.answers)
      ? saved[q.id].answers.filter(v => typeof v === 'string')
      : [];
    const labels = new Set(q.options.map(o => o.label));
    answers[q.id] = values.filter(v => labels.has(v));
    const other = values.filter(v => !labels.has(v));
    if (other.length) {
      custom[q.id] = other.join('\n');
      own[q.id] = true;
    }
  }
  return {answers, custom, own};
}
export function legacyQuestionSelection(questions, reply) {
  if (typeof reply !== 'string') return null;
  const saved = {};
  for (const q of normalizeQuestions(questions)) {
    const prefix = q.question + ': ';
    const line = reply.split('\n').find(line => line.startsWith(prefix));
    if (!line) return null;
    const text = line.slice(prefix.length);
    if (!text.trim()) return null;
    const exact = q.options.find(o => o.label === text);
    const pieces = q.multiple ? text.split(', ') : [text];
    saved[q.id] = {
      answers: exact ? [text] : pieces.every(p => q.options.some(o => o.label === p)) ? pieces : [text],
    };
  }
  return Object.keys(saved).length ? saved : null;
}

// Paths an agent mentions in inline code or links: `src/main.rs:42`, `./README.md`, `~/Notes/plan.md`.
// A bare name needs a known file extension (so `example.com` or `v1.2.3` stay text).
const FILE_EXTENSIONS =
  'md markdown txt json jsonc js jsx mjs cjs ts tsx rs py go java kt swift c cc cpp h hpp m mm cs rb php html htm css scss less svg png jpg jpeg gif webp bmp ico pdf csv tsv yaml yml toml xml sh zsh bash lock log sql mp4 mov webm mp3 wav m4a ogg docx xlsx pptx ini cfg conf env gradle vue svelte dart lua r ipynb';
const EXT_SET = new Set(FILE_EXTENSIONS.split(' '));
export function filePathRef(value) {
  let text = String(value ?? '').trim();
  if (
    !text ||
    text.length > 400 ||
    /\s/.test(text) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(text.replace(/^file:\/\//, ''))
  )
    return null;
  text = text.replace(/^file:\/\//, '');
  const m = text.match(
    /^((?:~\/|\.{1,2}\/|\/)?(?:[\w@.+-]+\/)*[\w@+-][\w@.+-]*\.([A-Za-z0-9]{1,10}))(?::(\d+))?(?::\d+)?$/
  );
  if (!m) return null;
  const ext = m[2].toLowerCase();
  if (!EXT_SET.has(ext)) return null;
  return {path: m[1], line: m[3] ? Number(m[3]) : null};
}

// What the side panel can render for a file. Order matters: specific text formats before plain text.
export function fileKind(name = '', mime = '') {
  const ext = String(name).split('.').pop().toLowerCase();
  if (ext === 'svg' || mime === 'image/svg+xml') return 'svg';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  if (['html', 'htm'].includes(ext) || mime === 'text/html') return 'html';
  if (['csv', 'tsv'].includes(ext)) return 'table';
  if (['json', 'jsonc', 'ipynb'].includes(ext) || mime === 'application/json') return 'json';
  const basic = previewKind({name, mime});
  if (basic === 'text') return 'code';
  if (basic !== 'file') return basic;
  return EXT_SET.has(ext) && !['docx', 'xlsx', 'pptx'].includes(ext) ? 'code' : 'file';
}

// Minimal CSV/TSV parser with quotes; at most `limit` rows for display.
export function parseDelimited(text, separator = ',', limit = 500) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length && rows.length < limit; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === separator) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if ((cell || row.length) && rows.length < limit) rows.push([...row, cell]);
  return rows;
}

// Language for highlighting a file by its extension.
export function languageForFile(name = '') {
  const ext = String(name).split('.').pop().toLowerCase();
  const map = {
    mjs: 'js',
    cjs: 'js',
    jsx: 'jsx',
    tsx: 'tsx',
    rs: 'rust',
    py: 'python',
    sh: 'shell',
    zsh: 'shell',
    bash: 'shell',
    yml: 'yaml',
    h: 'c',
    hpp: 'cpp',
    cc: 'cpp',
    m: 'objc',
    mm: 'objc',
    kt: 'kotlin',
    rb: 'ruby',
  };
  return 'language-' + (map[ext] || ext);
}
