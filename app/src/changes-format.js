// Pure helpers for the «Изменения» tab, tested without React.
import {loc} from './i18n.js';

// Unified diff → lines with a kind for colouring. Git headers (`diff --git`, `index`, `---`, `+++`) are dropped.
export function diffLines(diff) {
  const out = [];
  for (const text of String(diff || '').split('\n')) {
    if (
      /^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|similarity |old mode|new mode)/.test(
        text
      )
    )
      continue;
    if (text.startsWith('@@')) out.push({kind: 'hunk', text});
    else if (text.startsWith('+')) out.push({kind: 'add', text});
    else if (text.startsWith('-')) out.push({kind: 'del', text});
    else if (text.startsWith('\\')) out.push({kind: 'meta', text});
    else if (text.startsWith('Binary files')) out.push({kind: 'meta', text});
    else out.push({kind: 'ctx', text});
  }
  while (out.length && out.at(-1).kind === 'ctx' && !out.at(-1).text) out.pop();
  return out;
}

export function changesSummary(files) {
  return (files || []).reduce(
    (s, f) => ({added: s.added + (f.added || 0), removed: s.removed + (f.removed || 0)}),
    {added: 0, removed: 0}
  );
}

export function changeLabel(status) {
  return (
    {
      A: loc('Добавлен'),
      M: loc('Изменён'),
      D: loc('Удалён'),
      T: loc('Изменён тип'),
      '?': loc('Новый, не в git'),
    }[status] || loc('Изменён')
  );
}
